import { useEffect, useCallback, useRef, useReducer, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useSocket } from "../providers/Socket";
import { usePeer } from "../providers/Peer";
import { initialState, roomReducer } from "../providers/roomReducer";
import RealTimeClock from "../components/RealTimeClock";
import CallTime from "../components/CallTime";

// React Icons
import {
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Volume2,
  Share2,
  CircleAlert,
  Clock,
  Circle,
  Headphones,
  PhoneOff,
  MessageSquareText,
  MessageSquareOff,
  X,
  Users,
  Ear,
  RefreshCw,
  User,
  Video,
  Wifi,
  WifiOff,
} from "lucide-react";

// Toast notifications
import toast, { Toaster } from "react-hot-toast";

const RoomPage = () => {
  // Hooks
  const { socket, isConnected } = useSocket();
  const { 
    peer, 
    createOffer, 
    createAnswer, 
    setRemoteAns, 
    sendStream, 
    setRemoteSocketId, 
    resetPeerConnection,
    addIceCandidate 
  } = usePeer();

  const { roomId } = useParams();

  // Enhanced initial state
  const enhancedInitialState = useMemo(() => ({
    ...initialState,
    echoCancellationEnabled: true,
    noiseSuppressionEnabled: true,
    audioDevices: [],
    selectedAudioDevice: null,
    audioProcessingActive: true,
    isConnecting: false,
    connectionQuality: "good"
  }), []);

  // Reducer state
  const [state, dispatch] = useReducer(roomReducer, enhancedInitialState);

  // Refs
  const pendingIncomingCall = useRef(null);
  const myVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const remoteSocketIdRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const localAudioStreamRef = useRef(null);
  const analyserRef = useRef(null);
  const socketRef = useRef(socket);
  const peerRef = useRef(peer);
  const hasInitializedMedia = useRef(false);
  const connectionRetryCount = useRef(0);
  const iceCandidatesQueue = useRef([]);
  const retryTimeoutRef = useRef(null);
  
  const MAX_CONNECTION_RETRIES = 5;
  const MAX_ICE_CANDIDATE_QUEUE = 20;

  // Update refs when values change
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    peerRef.current = peer;
  }, [peer]);

  // Calculate total users
  const totalUsers = useMemo(() => (state.remoteName ? 2 : 1), [state.remoteName]);

  // ------------------ Helper Functions ------------------
  const getCallDurationText = () => {
    if (!state.callStartTime) return "0 seconds";
    const now = Date.now();
    const elapsed = now - state.callStartTime;
    const hours = Math.floor(elapsed / (1000 * 60 * 60));
    const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);

    let durationText = "";
    if (hours > 0) {
      durationText += `${hours} hour${hours > 1 ? "s" : ""}`;
      if (minutes > 0) durationText += ` ${minutes} minute${minutes > 1 ? "s" : ""}`;
    } else if (minutes > 0) {
      durationText += `${minutes} minute${minutes > 1 ? "s" : ""}`;
      if (seconds > 0 && minutes < 5) durationText += ` ${seconds} second${seconds > 1 ? "s" : ""}`;
    } else {
      durationText += `${seconds} second${seconds > 1 ? "s" : ""}`;
    }
    return durationText.trim();
  };

  // Check if peer connection is valid
  const isPeerConnectionValid = useCallback(() => {
    return peer && 
           peer.connectionState !== 'closed' && 
           peer.signalingState !== 'closed' &&
           peer.iceConnectionState !== 'closed';
  }, [peer]);

  // Ensure valid connection before operations
  const ensureValidConnection = useCallback(async () => {
    if (!peer || peer.connectionState === 'closed' || peer.signalingState === 'closed') {
      console.log("⚠️ Peer connection is closed, attempting to reset...");
      
      if (connectionRetryCount.current < MAX_CONNECTION_RETRIES) {
        connectionRetryCount.current++;
        
        // Reset peer connection
        if (resetPeerConnection) {
          resetPeerConnection();
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        toast(`🔄 Reconnecting... Attempt ${connectionRetryCount.current}/${MAX_CONNECTION_RETRIES}`, {
          duration: 2000,
        });
        
        return false;
      } else {
        toast.error("Connection failed after multiple attempts");
        return false;
      }
    }
    return true;
  }, [peer, resetPeerConnection]);

  // Process queued ICE candidates
  const processQueuedIceCandidates = useCallback(async () => {
    if (iceCandidatesQueue.current.length > 0 && peer && peer.remoteDescription) {
      console.log(`📥 Processing ${iceCandidatesQueue.current.length} queued ICE candidates`);
      const queue = [...iceCandidatesQueue.current];
      iceCandidatesQueue.current = [];
      
      for (const candidate of queue) {
        try {
          await addIceCandidate(candidate);
        } catch (err) {
          console.warn("⚠️ Failed to process queued ICE candidate:", err);
        }
      }
    }
  }, [peer, addIceCandidate]);

  // ------------------ Incoming Call Handler ------------------
  const handleIncomingCall = useCallback(
    async ({ from, offer, fromName }) => {
      console.log("📲 Incoming call from:", from, "name:", fromName);
      
      // Reset retry counter
      connectionRetryCount.current = 0;
      
      // Set remote user info
      dispatch({ type: "SET_REMOTE_EMAIL", payload: from });
      dispatch({ type: "SET_REMOTE_NAME", payload: fromName });
      dispatch({ type: "SET_IS_CONNECTING", payload: true });
      
      // Store remote socket ID
      remoteSocketIdRef.current = from;
      if (setRemoteSocketId) {
        setRemoteSocketId(from);
      }

      // If stream not ready, store as pending
      if (!state.streamReady) {
        pendingIncomingCall.current = { from, offer, fromName };
        console.log("⏳ Stream not ready, storing pending call...");
        return;
      }

      try {
        console.log("📝 Creating answer for incoming call...");
        
        // Ensure valid connection
        const isValid = await ensureValidConnection();
        if (!isValid) {
          throw new Error("Connection not valid");
        }
        
        // Wait a bit to ensure peer is ready
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const answer = await createAnswer(offer, from);
        
        console.log("📨 Sending answer to:", from);
        socketRef.current?.emit("call-accepted", { 
          to: from, 
          ans: answer 
        });
        
        console.log("✅ Answer sent successfully");
        dispatch({ type: "SET_IS_CONNECTING", payload: false });
      } catch (err) {
        console.error("❌ Error creating answer:", err);
        dispatch({ type: "SET_IS_CONNECTING", payload: false });
        toast.error("Failed to answer call. Please try reconnecting.");
      }
    },
    [createAnswer, setRemoteSocketId, state.streamReady, ensureValidConnection],
  );

  // ------------------ New User Joined Handler ------------------
  const handleNewUserJoined = useCallback(
    async ({ emailId, name, socketId }) => {
      console.log("👤 New user joined:", emailId, "socket:", socketId);
      
      // Reset retry counter
      connectionRetryCount.current = 0;
      
      // Store remote info
      dispatch({ type: "SET_REMOTE_EMAIL", payload: emailId });
      dispatch({ type: "SET_REMOTE_NAME", payload: name });
      dispatch({ type: "SET_IS_CONNECTING", payload: true });
      remoteSocketIdRef.current = socketId;
      
      if (setRemoteSocketId) {
        setRemoteSocketId(socketId);
      }

      // Don't initiate call if stream isn't ready
      if (!state.streamReady) {
        console.log("⏳ Stream not ready, delaying call initiation...");
        pendingIncomingCall.current = { fromEmail: emailId, fromName: name, socketId };
        return;
      }

      try {
        console.log("📞 Creating offer for new user...");
        
        // Ensure valid connection
        const isValid = await ensureValidConnection();
        if (!isValid) {
          throw new Error("Connection not valid");
        }
        
        // Wait a bit to ensure everything is initialized
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const offer = await createOffer();
        
        socketRef.current?.emit("call-user", { 
          emailId, 
          offer,
          socketId: socketId
        });
        
        console.log("✅ Offer sent to:", emailId);
        dispatch({ type: "SET_IS_CONNECTING", payload: false });
      } catch (err) {
        console.error("❌ Error creating offer:", err);
        dispatch({ type: "SET_IS_CONNECTING", payload: false });
        toast.error("Failed to create call offer.");
      }
    },
    [createOffer, setRemoteSocketId, state.streamReady, ensureValidConnection],
  );

  // ------------------ Call Accepted Handler ------------------
  const handleCallAccepted = useCallback(
    async ({ ans }) => {
      try {
        console.log("✅ Setting remote answer");
        await setRemoteAns(ans);
        console.log("✅ Remote answer set successfully");
        
        // Process any queued ICE candidates
        processQueuedIceCandidates();
      } catch (err) {
        console.error("❌ Error setting remote answer:", err);
        toast.error("Failed to accept call. Please try reconnecting.");
      }
    },
    [setRemoteAns, processQueuedIceCandidates],
  );

  // ------------------ Local Media Stream ------------------
  const getUserMediaStream = useCallback(async () => {
    if (hasInitializedMedia.current) {
      console.log("⚠️ Media already initialized");
      return;
    }
    
    hasInitializedMedia.current = true;
    dispatch({ type: "SET_IS_CONNECTING", payload: true });

    try {
      console.log("🎥 Requesting media permissions...");
      
      let stream;
      const constraints = {
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: "user",
          deviceId: undefined // Let browser choose best camera
        },
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          channelCount: 1,
          sampleRate: 48000,
          latency: 0.01,
          deviceId: undefined // Let browser choose best microphone
        }
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        console.log("🔄 Trying fallback constraints...");
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
      }

      console.log("✅ Media access granted");
      dispatch({ type: "SET_MY_STREAM", payload: stream });
      
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = stream;
        myVideoRef.current.muted = true;
        myVideoRef.current.playsInline = true;
      }
      
      // Send stream to peer connection
      if (sendStream) {
        await sendStream(stream);
        dispatch({ type: "SET_STREAM_READY", payload: true });
        console.log("✅ Stream sent to peer connection");
      }

      // Handle pending incoming call
      if (pendingIncomingCall.current) {
        console.log("🔄 Processing pending incoming call...");
        setTimeout(() => {
          handleIncomingCall(pendingIncomingCall.current);
          pendingIncomingCall.current = null;
        }, 1000);
      }

      dispatch({ type: "SET_IS_CONNECTING", payload: false });
    } catch (err) {
      console.error("❌ Error accessing media:", err);
      hasInitializedMedia.current = false;
      dispatch({ type: "SET_IS_CONNECTING", payload: false });
      
      if (err.name === 'NotAllowedError') {
        toast.error("Camera/microphone access was denied. Please allow permissions.");
      } else if (err.name === 'NotFoundError') {
        toast.error("No camera/microphone found. Please check your devices.");
      } else if (err.name === 'NotReadableError') {
        toast.error("Camera/microphone is already in use by another application.");
      } else {
        toast.error("Failed to access camera/microphone. Please check permissions.");
      }
    }
  }, [sendStream, handleIncomingCall]);

  // Initialize media stream
  useEffect(() => {
    if (!state.myStream && !state.streamReady && !hasInitializedMedia.current) {
      getUserMediaStream();
    }
  }, [getUserMediaStream, state.myStream, state.streamReady]);

  // Cleanup media on unmount
  useEffect(() => {
    return () => {
      if (state.myStream) {
        state.myStream.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [state.myStream]);

  // ------------------ ICE Candidates Handling ------------------
  useEffect(() => {
    if (!socket || !peer) return;

    console.log("🔌 Setting up ICE candidate handlers");

    const handleIncomingIceCandidate = async ({ candidate, from }) => {
      console.log("📥 Received ICE candidate from:", from);
      
      // Verify this candidate is for our current remote peer
      if (from !== remoteSocketIdRef.current) {
        console.warn("⚠️ ICE candidate from non-current peer, ignoring");
        return;
      }
      
      try {
        if (candidate && addIceCandidate) {
          // If remote description is set, add candidate immediately
          if (peer.remoteDescription) {
            await addIceCandidate(candidate);
            console.log("✅ ICE candidate added successfully");
          } else {
            // Queue candidate for later
            if (iceCandidatesQueue.current.length < MAX_ICE_CANDIDATE_QUEUE) {
              iceCandidatesQueue.current.push(candidate);
              console.log("📦 Queued ICE candidate (waiting for remote description)");
            }
          }
        }
      } catch (err) {
        console.error("❌ Error adding ICE candidate:", err);
      }
    };

    // Set up local ICE candidate generation
    const handleLocalIceCandidate = (event) => {
      if (event.candidate && remoteSocketIdRef.current && socket && isPeerConnectionValid()) {
        console.log("📤 Sending ICE candidate to:", remoteSocketIdRef.current);
        socket.emit("ice-candidate", {
          to: remoteSocketIdRef.current,
          candidate: event.candidate,
        });
      }
    };

    // Remove old listeners and add new ones
    socket.off("ice-candidate");
    socket.on("ice-candidate", handleIncomingIceCandidate);
    
    if (peer) {
      peer.onicecandidate = handleLocalIceCandidate;
      
      // Monitor ICE connection state
      peer.oniceconnectionstatechange = () => {
        console.log("❄️ ICE Connection State:", peer.iceConnectionState);
        
        // Update connection quality based on ICE state
        switch (peer.iceConnectionState) {
          case 'connected':
          case 'completed':
            dispatch({ type: "SET_CONNECTION_QUALITY", payload: "good" });
            break;
          case 'disconnected':
            dispatch({ type: "SET_CONNECTION_QUALITY", payload: "poor" });
            break;
          case 'failed':
            dispatch({ type: "SET_CONNECTION_QUALITY", payload: "failed" });
            toast.error("Connection failed. Trying to reconnect...");
            break;
        }
      };
    }

    return () => {
      socket.off("ice-candidate", handleIncomingIceCandidate);
      if (peer) {
        peer.onicecandidate = null;
        peer.oniceconnectionstatechange = null;
      }
    };
  }, [socket, peer, addIceCandidate, isPeerConnectionValid]);

  // ------------------ Remote Track Handling ------------------
  useEffect(() => {
    const handleTrackEvent = (event) => {
      console.log("🎬 Track event received:", event.streams.length, "streams");
      
      if (event.streams && event.streams[0]) {
        remoteStreamRef.current = event.streams[0];
        console.log("✅ Remote stream received with tracks:", 
          remoteStreamRef.current.getTracks().map(t => `${t.kind}:${t.id}`));

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStreamRef.current;
          remoteVideoRef.current.volume = 1.0;
          remoteVideoRef.current.playsInline = true;
          
          // Play with error handling
          const playPromise = remoteVideoRef.current.play();
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              if (error.name !== "AbortError") {
                console.error("❌ Error playing remote video:", error);
              }
            });
          }
        }
      }
    };

    if (peer) {
      peer.addEventListener("track", handleTrackEvent);
      
      // Check for existing receivers
      const receivers = peer.getReceivers();
      console.log("📡 Current receivers:", receivers.length);
    }
    
    return () => {
      if (peer) {
        peer.removeEventListener("track", handleTrackEvent);
      }
    };
  }, [peer]);

  // Process pending calls when stream becomes ready
  useEffect(() => {
    if (state.streamReady && pendingIncomingCall.current) {
      console.log("🔄 Processing pending call now that stream is ready");
      
      // Process pending call with a small delay
      setTimeout(() => {
        handleIncomingCall(pendingIncomingCall.current);
        pendingIncomingCall.current = null;
      }, 1000);
    }
  }, [state.streamReady, handleIncomingCall]);

  // Attach my own camera stream
  useEffect(() => {
    if (myVideoRef.current && state.myStream) {
      myVideoRef.current.srcObject = state.myStream;
    }
  }, [state.myStream]);

  // Attach remote stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [remoteStreamRef.current]);

  // Start call timer when remote video becomes ready
  useEffect(() => {
    if (remoteStreamRef.current && !state.isCallActive) {
      const videoTrack = remoteStreamRef.current.getVideoTracks()[0];
      const audioTrack = remoteStreamRef.current.getAudioTracks()[0];
      
      if (videoTrack || audioTrack) {
        dispatch({ type: "START_CALL" });
        console.log("⏱️ Call timer started");
        
        // Update remote video ready state
        if (videoTrack) {
          dispatch({ type: "SET_REMOTEVIDEOREADY", payload: true });
        }
      }
    }
  }, [remoteStreamRef.current, state.isCallActive]);

  // ------------------ Connection Monitoring ------------------
  useEffect(() => {
    const monitorConnection = () => {
      if (!peer || !state.remoteEmail) return;
      
      const states = {
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
        signalingState: peer.signalingState
      };
      
      // Auto-reconnect on failure
      if ((states.connectionState === 'failed' || 
           states.iceConnectionState === 'failed' ||
           states.connectionState === 'disconnected') && 
          state.remoteEmail && 
          connectionRetryCount.current < MAX_CONNECTION_RETRIES) {
        
        console.log("🔄 Connection issue detected, attempting to reconnect...");
        
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
        }
        
        retryTimeoutRef.current = setTimeout(async () => {
          await ensureValidConnection();
          
          // Try to re-establish call
          if (state.remoteEmail && remoteSocketIdRef.current) {
            handleNewUserJoined({ 
              emailId: state.remoteEmail, 
              name: state.remoteName,
              socketId: remoteSocketIdRef.current 
            });
          }
        }, 2000);
      }
    };

    const interval = setInterval(monitorConnection, 3000);
    
    if (peer) {
      peer.addEventListener('connectionstatechange', monitorConnection);
      peer.addEventListener('iceconnectionstatechange', monitorConnection);
    }
    
    return () => {
      clearInterval(interval);
      if (peer) {
        peer.removeEventListener('connectionstatechange', monitorConnection);
        peer.removeEventListener('iceconnectionstatechange', monitorConnection);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [peer, state.remoteEmail, state.remoteName, handleNewUserJoined, ensureValidConnection]);

  // ------------------ Socket Events Setup ------------------
  useEffect(() => {
    if (!socket) {
      console.log("❌ No socket connection");
      return;
    }

    console.log("🔌 Socket connected, setting up listeners...");

    const handleJoinedRoom = () => {
      dispatch({ type: "SET_HAS_JOINED_ROOM", payload: true });
      console.log("✅ Joined room successfully");
    };

    const handleChatMessage = (data) => {
      // Add to chat
      dispatch({ type: "ADD_MESSAGE", payload: data });

      // Show toast for messages from others
      if (data.from !== socket.id) {
        toast.custom(
          (t) => (
            <div className="bg-green-800 shadow-2xl text-white p-4 rounded-xl flex items-center gap-2 z-50">
              <MessageSquareText className="w-5 h-5" />
              <span>
                {data.senderName || "Guest"}: {data.text}
              </span>
            </div>
          ),
          { duration: 3000 },
        );
      }
    };

    const handleUserLeft = ({ socketId, userName }) => {
      console.log("🚪 User left:", userName || socketId);
      
      if (socketId === remoteSocketIdRef.current) {
        pendingIncomingCall.current = null;
        remoteSocketIdRef.current = null;
        
        // Stop and reset remote video
        if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
          remoteVideoRef.current.srcObject.getTracks().forEach((t) => t.stop());
          remoteVideoRef.current.srcObject = null;
        }

        // Reset remote stream reference
        remoteStreamRef.current = null;

        // Show toast for call duration
        if (state.isCallActive) {
          const callDuration = getCallDurationText();
          toast.custom(
            (t) => (
              <div className="bg-blue-900 w-72 shadow-2xl text-white p-4 font-sans rounded-xl flex flex-col">
                <div className="flex items-center gap-2">
                  <CircleAlert className="w-5 h-5 text-yellow-400" />
                  <span className="font-semibold">{userName || "User"} Disconnected</span>
                </div>
                <div className="mt-2 text-sm opacity-90">
                  Call duration: <span className="font-bold">{callDuration}</span>
                </div>
              </div>
            ),
            { duration: 5000 },
          );
        }

        // Reset remote-related state
        dispatch({ type: "SET_REMOTE_NAME", payload: null });
        dispatch({ type: "SET_REMOTE_EMAIL", payload: null });
        dispatch({ type: "SET_REMOTE_CAMERA", payload: false });
        dispatch({ type: "SET_REMOTEVIDEOREADY", payload: false });
        dispatch({ type: "END_CALL" });
        
        connectionRetryCount.current = 0;
        iceCandidatesQueue.current = [];
      }
    };

    // Remove all listeners first to avoid duplicates
    socket.off("joined-room");
    socket.off("user-joined");
    socket.off("incoming-call");
    socket.off("call-accepted");
    socket.off("chat-message");
    socket.off("user-left");
    socket.off("connect_error");

    // Add listeners
    socket.on("joined-room", handleJoinedRoom);
    socket.on("user-joined", handleNewUserJoined);
    socket.on("incoming-call", handleIncomingCall);
    socket.on("call-accepted", handleCallAccepted);
    socket.on("chat-message", handleChatMessage);
    socket.on("user-left", handleUserLeft);
    
    // Socket error handling
    socket.on("connect_error", (error) => {
      console.error("❌ Socket connection error:", error);
      toast.error("Connection error. Please refresh.");
    });

    // Join the room
    const savedData = localStorage.getItem("userData");
    const userData = savedData ? JSON.parse(savedData) : { name: "Guest", email: "guest@example.com" };
    
    socket.emit("join-room", { 
      roomId, 
      emailId: userData.email, 
      name: userData.name 
    });

    return () => {
      console.log("🧹 Cleaning up socket listeners...");
      socket.off("joined-room");
      socket.off("user-joined", handleNewUserJoined);
      socket.off("incoming-call", handleIncomingCall);
      socket.off("call-accepted", handleCallAccepted);
      socket.off("chat-message", handleChatMessage);
      socket.off("user-left", handleUserLeft);
      socket.off("connect_error");
    };
  }, [socket, roomId, handleNewUserJoined, handleIncomingCall, handleCallAccepted, state.isCallActive]);

  // ------------------ UI Functions ------------------

  // Copy meeting link
  const copyMeetingLink = async () => {
    const link = `${window.location.origin}/room/${roomId}`;
    const message = `📹 Join my video meeting on MeetNow\n\n🔑 Room ID: ${roomId}\n🔗 Link: ${link}`;

    try {
      await navigator.clipboard.writeText(message);
      toast.success("Meeting link copied!", { 
        icon: "🔗",
        duration: 2000 
      });
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = message;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      toast.success("Meeting link copied!", { 
        icon: "🔗",
        duration: 2000 
      });
    }
  };

  // Leave room
  const leaveRoom = () => {
    // Calculate total call duration
    const callDuration = getCallDurationText();

    // Show toast with call duration
    if (state.isCallActive) {
      toast.success(`Call ended. Duration: ${callDuration}`, {
        duration: 5000,
        icon: "📞",
        style: {
          background: "#1e293b",
          color: "#fff",
          padding: "16px",
          borderRadius: "8px",
        },
      });
    } else {
      toast.success("Left the room", { 
        icon: "👋",
        duration: 2000 
      });
    }

    // Stop all local tracks
    if (state.myStream) {
      state.myStream.getTracks().forEach((track) => track.stop());
      console.log("🛑 Local media tracks stopped");
    }

    // Cleanup audio processing
    if (audioProcessorRef.current) {
      audioProcessorRef.current.disconnect();
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }

    // Reset remote video
    if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
      remoteVideoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      remoteVideoRef.current.srcObject = null;
    }

    // Reset local video
    if (myVideoRef.current) {
      myVideoRef.current.srcObject = null;
    }

    // Reset peer connection
    if (peer) {
      peer.close();
      console.log("🛑 Peer connection closed");
    }

    // Reset call timer
    dispatch({ type: "END_CALL" });

    // Notify server you left
    if (socket && roomId) {
      socket.emit("leave-room", { roomId });
      console.log("📤 Leave room notification sent");
    }

    // Reset all refs
    pendingIncomingCall.current = null;
    remoteSocketIdRef.current = null;
    remoteStreamRef.current = null;
    hasInitializedMedia.current = false;
    connectionRetryCount.current = 0;
    iceCandidatesQueue.current = [];
    
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    // Redirect after a short delay
    setTimeout(() => {
      window.location.href = "/";
    }, 1500);
  };

  // ------------------ Media Controls ------------------

  // Toggle camera
  const toggleCamera = () => {
    if (!state.myStream) return;
    const newCameraState = !state.cameraOn;
    state.myStream.getVideoTracks().forEach((track) => (track.enabled = newCameraState));
    dispatch({ type: "TOGGLE_CAMERA" });
    socket.emit("camera-toggle", { cameraOn: newCameraState, roomId });
    toast(newCameraState ? "Camera ON" : "Camera OFF", { icon: newCameraState ? "📹" : "📵" });
  };

  // Toggle microphone
  const toggleMic = () => {
    if (!state.myStream) return;
    const newMicState = !state.micOn;
    state.myStream.getAudioTracks().forEach((t) => {
      t.enabled = newMicState;
      if (newMicState) {
        t.applyConstraints({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }).catch(console.warn);
      }
    });
    dispatch({ type: "TOGGLE_MIC" });
    toast(newMicState ? "Mic ON" : "Mic OFF", { icon: newMicState ? "🎤" : "🔇" });
  };

  // Toggle handfree/speaker mode
  const toggleHandfree = async () => {
    if (!remoteVideoRef.current || !state.myStream) return;
    const micTracks = state.myStream.getAudioTracks();
    
    if (!state.usingHandfree && state.handfreeDeviceId) {
      try {
        await remoteVideoRef.current.setSinkId(state.handfreeDeviceId);
        micTracks.forEach((t) => {
          t.enabled = false;
          t.applyConstraints({ echoCancellation: true });
        });
        dispatch({ type: "TOGGLE_HANDFREE" });
        toast("Speaker Mode ON - Microphone muted", { icon: "🔊", duration: 3000 });
      } catch (err) {
        console.error("Failed to switch to speaker:", err);
        toast.error("Failed to switch to speaker mode");
      }
    } else {
      try {
        await remoteVideoRef.current.setSinkId("");
        micTracks.forEach((t) => {
          t.enabled = true;
          t.applyConstraints({ echoCancellation: true });
        });
        dispatch({ type: "TOGGLE_HANDFREE" });
        toast("Headphone Mode ON", { icon: "🎧" });
      } catch (err) {
        console.error("Failed to switch to headphones:", err);
      }
    }
  };

  // Enhanced Audio Controls
  const toggleEchoCancellation = async () => {
    if (!state.myStream) return;
    const newEchoState = !state.echoCancellationEnabled;
    const audioTracks = state.myStream.getAudioTracks();
    for (const track of audioTracks) {
      try {
        await track.applyConstraints({ echoCancellation: newEchoState });
      } catch (err) {
        console.warn("Could not toggle echo cancellation:", err);
      }
    }
    dispatch({ type: "TOGGLE_ECHO_CANCELLATION" });
    toast(newEchoState ? "Echo Cancellation ON" : "Echo Cancellation OFF", {
      icon: newEchoState ? "✅" : "❌"
    });
  };

  const toggleNoiseSuppression = async () => {
    if (!state.myStream) return;
    const newNoiseState = !state.noiseSuppressionEnabled;
    const audioTracks = state.myStream.getAudioTracks();
    for (const track of audioTracks) {
      try {
        await track.applyConstraints({ noiseSuppression: newNoiseState });
      } catch (err) {
        console.warn("Could not toggle noise suppression:", err);
      }
    }
    dispatch({ type: "TOGGLE_NOISE_SUPPRESSION" });
    toast(newNoiseState ? "Noise Suppression ON" : "Noise Suppression OFF", {
      icon: newNoiseState ? "🔇" : "🔊"
    });
  };

  const toggleAudioProcessing = () => {
    const newAudioProcessingState = !state.audioProcessingActive;
    dispatch({ type: "SET_AUDIO_PROCESSING_ACTIVE", payload: newAudioProcessingState });
    toast(newAudioProcessingState ? "Audio Processing ON" : "Audio Processing OFF", {
      icon: newAudioProcessingState ? "🎚️" : "🔇"
    });
  };

  // Detect audio devices
  useEffect(() => {
    const detectAudioDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputDevices = devices.filter((d) => d.kind === "audioinput");
        const audioOutputDevices = devices.filter((d) => d.kind === "audiooutput");
        
        dispatch({ type: "SET_AUDIO_DEVICES", payload: audioInputDevices });
        
        if (audioOutputDevices.length > 0) {
          dispatch({ type: "SET_HANDFREE_DEVICE", payload: audioOutputDevices[0].deviceId });
        }
      } catch (err) {
        console.error("Failed to enumerate devices:", err);
      }
    };

    detectAudioDevices();
  }, []);

  // Select audio device
  const selectAudioDevice = async (deviceId) => {
    try {
      const videoTrack = state.myStream?.getVideoTracks()[0];
      const videoConstraints = videoTrack ? videoTrack.getSettings() : true;
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true
        },
        video: videoConstraints
      });
      
      if (state.myStream) {
        state.myStream.getTracks().forEach(track => track.stop());
      }
      
      dispatch({ type: "SET_MY_STREAM", payload: stream });
      dispatch({ type: "SELECT_AUDIO_DEVICE", payload: deviceId });
      
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = stream;
      }
      
      if (sendStream && isPeerConnectionValid()) {
        await sendStream(stream);
      }
      
      toast.success("Audio device changed");
    } catch (err) {
      console.error("Failed to switch audio device:", err);
      toast.error("Failed to change audio device");
    }
  };

  // Chat handlers
  const handleChat = () => {
    dispatch({ type: "SET_CHATCLOSE", payload: !state.chatClose });
  };

  const handleSwipped = () => {
    dispatch({ type: "SET_IsSWAPPED", payload: !state.isSwapped });
  };

  const handleRemoteVideoReady = () => {
    dispatch({ type: "SET_REMOTEVIDEOREADY", payload: true });
    if (!state.isCallActive) {
      dispatch({ type: "START_CALL" });
    }
    console.log("✅ Remote video ready, call started");
  };

  // Send message
  const sendMessage = () => {
    if (!state.messageText.trim() || !socket) return;
    socket.emit("chat-message", { roomId, text: state.messageText });
    dispatch({
      type: "ADD_MESSAGE",
      payload: {
        from: socket.id,
        text: state.messageText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    });
    dispatch({ type: "SET_MESSAGE_TEXT", payload: "" });
  };

  // Handle manual reconnection
  const handleReconnect = async () => {
    console.log("🔄 Manual reconnection requested");
    connectionRetryCount.current = 0;
    
    if (resetPeerConnection) {
      resetPeerConnection();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (state.remoteEmail && remoteSocketIdRef.current) {
      handleNewUserJoined({ 
        emailId: state.remoteEmail, 
        name: state.remoteName,
        socketId: remoteSocketIdRef.current 
      });
    }
    
    toast("🔄 Reconnecting...", { duration: 2000 });
  };

  // Debug function
  const debugWebRTC = () => {
    console.log("=== WEBRTC DEBUG INFO ===");
    console.log("Socket Connected:", isConnected);
    console.log("Socket ID:", socket?.id);
    console.log("Remote Socket ID:", remoteSocketIdRef.current);
    console.log("Peer State:", peer?.connectionState);
    console.log("ICE State:", peer?.iceConnectionState);
    console.log("Local Stream:", !!state.myStream);
    console.log("Remote Stream:", !!remoteStreamRef.current);
    console.log("Stream Ready:", state.streamReady);
    console.log("Pending Call:", pendingIncomingCall.current);
    console.log("Connection Retries:", connectionRetryCount.current);
    console.log("ICE Queue:", iceCandidatesQueue.current.length);
    console.log("=========================");
  };

  // Load user name from localStorage
  useEffect(() => {
    const savedData = localStorage.getItem("userData");
    if (savedData) {
      const { name: savedName } = JSON.parse(savedData);
      dispatch({ type: "SET_MY_NAME", payload: savedName });
    }
  }, []);

  // Component cleanup on unmount
  useEffect(() => {
    return () => {
      console.log("🧹 Component unmounting - cleanup");
      
      // Stop local stream
      if (state.myStream) {
        state.myStream.getTracks().forEach(track => track.stop());
      }
      
      // Stop remote stream
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
        remoteVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
      
      // Close peer connection
      if (peer) {
        peer.close();
      }
      
      // Close audio context
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      
      // Notify server
      if (socket && roomId) {
        socket.emit("leave-room", { roomId });
      }
      
      // Clear all refs
      pendingIncomingCall.current = null;
      remoteSocketIdRef.current = null;
      remoteStreamRef.current = null;
      hasInitializedMedia.current = false;
      connectionRetryCount.current = 0;
      iceCandidatesQueue.current = [];
      
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [socket, roomId, peer, state.myStream]);

  // Listen for remote camera toggle
  useEffect(() => {
    if (!socket) return;
    const handleCameraToggle = ({ cameraOn }) => {
      dispatch({ type: "SET_REMOTE_CAMERA", payload: cameraOn });
    };
    socket.on("camera-toggle", handleCameraToggle);
    return () => socket.off("camera-toggle", handleCameraToggle);
  }, [socket]);

  // Listen for chat messages
  useEffect(() => {
    if (!socket) return;
    const handleChatMessage = (data) => {
      if (data.from !== socket.id && !state.remoteName && data.senderName) {
        dispatch({ type: "SET_REMOTE_NAME", payload: data.senderName });
      }
      dispatch({ type: "ADD_MESSAGE", payload: data });
    };
    socket.on("chat-message", handleChatMessage);
    return () => socket.off("chat-message", handleChatMessage);
  }, [socket, state.remoteName]);

  // ------------------ UI Render ------------------
  return (
    <div className="min-h-screen text-white flex bg-gradient-to-br from-gray-900 via-black to-blue-900 overflow-hidden">
      {/* Header */}
      <header className="fixed h-18 sm:h-16 flex items-center justify-between bg-[#000000] text-white shadow-2xl w-full p-2 sm:px-4 z-50">
        <div className="sm:flex items-center sm:space-x-4">
          {/* Connection Status */}
          <div className="flex items-center space-x-3">
            {!isConnected ? (
              <span className="flex items-center font-sans font-semibold text-lg">
                <WifiOff className="text-red-500 w-4 h-4 mr-1" /> Disconnected
              </span>
            ) : !remoteStreamRef.current ? (
              <span className="flex items-center font-sans font-semibold text-lg">
                <Circle className="text-yellow-500 w-3 h-3 mr-1" /> Waiting...
              </span>
            ) : (
              <span className="flex items-center font-sans font-semibold text-lg">
                <Wifi className="text-green-500 w-4 h-4 mr-1" /> Connected
              </span>
            )}

            {/* Room ID */}
            <span className="rounded-md text-lg font-bold">
              Room: <span className="text-blue-500"> {roomId}</span>
            </span>

            {/* Call Duration */}
            {state.remoteName && (
              <span className="p-0.5 sm:px-2 rounded-md font-sans font-semibold text-white text-lg">
                {state.isCallActive ? <CallTime state={state} dispatch={dispatch} /> : "00:00"}
              </span>
            )}
          </div>
        </div>

        <div className="sm:flex sm:items-center sm:space-x-3 my-auto">
          <span className="flex items-center space-x-4 bg-gray-800 p-0.5 sm:px-2 rounded-md font-sans">
            <Users className="w-5 h-5 mr-1 text-green-500" /> {totalUsers} online
          </span>
          <span className="flex items-center mt-1 sm:mt-0">
            <Clock className="w-5 h-5 my-1 mr-1 text-amber-500 font-bold" /> <RealTimeClock />
          </span>
        </div>
      </header>

      {/* Video Container */}
      <div className="relative w-screen py-2 mt-17 sm:mt-14">
        {/* REMOTE VIDEO */}
        <div
          onClick={handleSwipped}
          className={`absolute transition-all duration-300 rounded-md bg-[#0d1321]
            ${state.isSwapped 
              ? "top-4 right-4 w-56 sm:w-56 h-36 z-20 shadow-2xl" 
              : "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 inset-0 w-full xl:max-w-4xl h-[95%] z-10"
            }
          `}
        >
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            onCanPlay={handleRemoteVideoReady}
            className={`w-full h-full object-cover shadow-2xl rounded-md bg-[#0d1321] ${state.remoteCameraOn ? "block" : "hidden"} `}
          />

          {remoteStreamRef.current && (
            <span className="absolute top-2 left-2 z-40 font-sans font-semibold bg-green-700 px-3 py-1 text-sm rounded-full">
              {state.remoteName}
            </span>
          )}

          {/* Overlay when camera is off */}
          {!state.remoteCameraOn && state.remoteName && (
            <div className="absolute inset-0 flex items-center justify-center z-40">
              <span className="flex items-center justify-center w-18 h-18 rounded-full bg-blue-700 text-white text-4xl sm:text-5xl font-semibold shadow-lg">
                {state.remoteName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          {/* Waiting for participants */}
          {!remoteStreamRef.current && state.isConnecting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-40">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
              <span className="font-sans text-lg text-center">
                Connecting to {state.remoteName}...
              </span>
            </div>
          )}

          {!remoteStreamRef.current && !state.isConnecting && !state.isSwapped && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-40">
              <User className="w-16 h-16 text-gray-500 mb-4" />
              <span className="font-sans text-lg text-center text-gray-400">
                Waiting for participants...
              </span>
              <span className="text-sm text-gray-500 mt-2">
                Share the meeting link to invite others
              </span>
            </div>
          )}
        </div>

        {/* MY VIDEO */}
        <div
          onClick={handleSwipped}
          className={`absolute transition-all duration-300 rounded-md bg-[#0d1321]
            ${state.isSwapped 
              ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 inset-0 w-full xl:max-w-4xl h-[95%] z-10" 
              : "top-4 right-4 w-56 sm:w-56 h-36 z-20 shadow-2xl bg-gray-800"
            }
          `}
        >
          <video
            ref={myVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full rounded-md object-cover shadow-2xl bg-[#0d1321] ${state.cameraOn ? "block" : "hidden"} `}
          />

          <span className="absolute top-2 left-2 z-40 font-sans font-semibold bg-green-700 px-3 py-1 text-sm rounded-full">
            {state.myName || "You"}
          </span>

          {!state.cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center z-40">
              <span className="flex items-center justify-center w-18 h-18 rounded-full bg-blue-700 text-white text-4xl sm:text-5xl font-semibold shadow-lg">
                {(state.myName || "Y").charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Chat Panel */}
      {state.chatClose && (
        <div className="absolute top-0 right-0 h-full w-80 sm:96 bg-gray-900/95 backdrop-blur-xl border-l border-gray-800 z-50 flex flex-col">
          <div className="p-4 border-b border-gray-800 flex justify-between items-center">
            <h3 className="text-lg font-semibold">Chat</h3>
            <button
              onClick={handleChat}
              className="p-2 hover:bg-gray-800 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {state.messages.map((msg, idx) => {
              const isMe = msg.from === socket?.id;
              return (
                <div key={idx} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-2 ${isMe ? "bg-gradient-to-r from-blue-600 to-indigo-600" : "bg-gray-800"}`}
                  >
                    <div className="text-xs opacity-75 mb-1">
                      {isMe ? state.myName : state.remoteName} • {msg.timestamp || "Just now"}
                    </div>
                    <div className="text-sm">{msg.text}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 border-t border-gray-800">
            <div className="flex gap-2">
              <input
                type="text"
                value={state.messageText}
                onChange={(e) => dispatch({ type: "SET_MESSAGE_TEXT", payload: e.target.value })}
                onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Type a message..."
                className="flex-1 bg-gray-800 rounded-full px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={sendMessage}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-6 rounded-full font-medium transition-all duration-300"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <Toaster position="top-right" reverseOrder={false} />

      {/* Control Bar */}
      <div className="fixed flex flex-wrap w-full max-w-92 sm:max-w-2xl justify-center place-items-center gap-2.5 sm:gap-4 bottom-6 left-1/2 z-40 -translate-x-1/2 bg-[#0b1018] backdrop-blur-lg sm:px-4 py-3 rounded-xl shadow-2xl">
        {/* Camera */}
        <button
          onClick={toggleCamera}
          className={`p-3 rounded-full ${state.cameraOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'} transition-colors`}
          title="Toggle Camera"
        >
          {state.cameraOn ? <Camera size={20} /> : <CameraOff size={20} />}
        </button>

        {/* Microphone */}
        <button
          onClick={toggleMic}
          className={`p-3 rounded-full ${state.micOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'} transition-colors`}
          title="Toggle Microphone"
        >
          {state.micOn ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        {/* Speaker/Headphone */}
        <button
          onClick={toggleHandfree}
          className={`p-3 rounded-full ${state.usingHandfree ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-600'} transition-colors`}
          title="Toggle Speaker/Headphone Mode"
        >
          {state.usingHandfree ? <Headphones size={20} /> : <Volume2 size={20} />}
        </button>

        {/* Audio Controls */}
        <button
          onClick={toggleEchoCancellation}
          className={`p-3 rounded-full ${state.echoCancellationEnabled ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-600'} transition-colors`}
          title="Toggle Echo Cancellation"
        >
          <Ear size={20} />
        </button>

        <button
          onClick={toggleNoiseSuppression}
          className={`p-3 rounded-full ${state.noiseSuppressionEnabled ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-600'} transition-colors`}
          title="Toggle Noise Suppression"
        >
          <Mic size={20} />
        </button>

        {/* Chat */}
        <button
          onClick={handleChat}
          className={`p-3 rounded-full ${state.chatClose ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'} transition-colors`}
          title="Toggle Chat"
        >
          {state.chatClose ? <MessageSquareText size={20} /> : <MessageSquareOff size={20} />}
        </button>

        {/* Reconnect */}
        <button
          onClick={handleReconnect}
          className="p-3 rounded-full bg-yellow-600 hover:bg-yellow-700 transition-colors"
          title="Reconnect Call"
        >
          <RefreshCw size={20} />
        </button>

        {/* Share */}
        <button
          onClick={copyMeetingLink}
          className="p-3 rounded-full bg-green-600 hover:bg-green-700 transition-colors"
          title="Share Meeting Link"
        >
          <Share2 size={20} />
        </button>
        
        {/* Leave */}
        <button
          onClick={leaveRoom}
          className="p-3 rounded-full bg-red-600 hover:bg-red-700 transition-colors"
          title="Leave Call"
        >
          <PhoneOff size={20} />
        </button>
      </div>

      {/* Audio Device Selector */}
      {state.audioDevices.length > 1 && (
        <div className="fixed bottom-28 right-4 bg-gray-800 p-3 rounded-lg shadow-lg z-50">
          <select
            onChange={(e) => selectAudioDevice(e.target.value)}
            value={state.selectedAudioDevice || ''}
            className="bg-gray-700 text-white p-2 rounded text-sm w-full"
          >
            <option value="">Select Microphone</option>
            {state.audioDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Mic ${device.deviceId.slice(0, 5)}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Debug Button (Development Only) */}
      {process.env.NODE_ENV === 'development' && (
        <button
          onClick={debugWebRTC}
          className="fixed bottom-24 left-4 bg-gray-800 text-white p-3 rounded-full text-xs z-50 hover:bg-gray-700"
        >
          🐛 Debug
        </button>
      )}

      {/* Connection Status Indicator */}
      <div className="fixed top-20 left-4 z-40">
        {state.connectionQuality === "poor" && (
          <div className="flex items-center bg-yellow-600/80 text-white px-3 py-1 rounded-full text-sm">
            <WifiOff size={14} className="mr-1" /> Poor Connection
          </div>
        )}
        {state.connectionQuality === "failed" && (
          <div className="flex items-center bg-red-600/80 text-white px-3 py-1 rounded-full text-sm">
            <WifiOff size={14} className="mr-1" /> Connection Failed
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomPage;
