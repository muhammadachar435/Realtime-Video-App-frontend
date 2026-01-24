// Import hooks
import { useEffect, useCallback, useRef, useReducer, useMemo, useState } from "react";

// Import router
import { useParams } from "react-router-dom";

// Import Files
import { useSocket } from "../providers/Socket";
import { usePeer } from "../providers/Peer";
import { initialState, roomReducer } from "../providers/roomReducer";
import RealTimeClock from "../components/RealTimeClock";
import CallTime from "../components/CallTime";

// Import React-Icons
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
  FlipHorizontal2, // Add this for camera switch icon
} from "lucide-react";

// import toast to display Notification
import toast, { Toaster } from "react-hot-toast";

// RoomPage Component
const RoomPage = () => {
  // Socket Destruction
  const { socket } = useSocket();
  const { peer, createOffer, createAnswer, setRemoteAns, sendStream, setRemoteSocketId } = usePeer();

  // RoomID
  const { roomId } = useParams();

  // ================ ADD THESE STATES ================
  const [cameras, setCameras] = useState([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  // =================================================

  // Enhanced initialState
  const enhancedInitialState = useMemo(
    () => ({
      ...initialState,
      echoCancellationEnabled: true,
      noiseSuppressionEnabled: true,
      audioDevices: [],
      selectedAudioDevice: null,
      audioProcessingActive: false,
    }),
    [],
  );

  // useReducer
  const [state, dispatch] = useReducer(roomReducer, enhancedInitialState);

  // useRef
  const pendingIncomingCall = useRef(null);
  const myVideoRef = useRef();
  const remoteVideoRef = useRef();
  const remoteStreamRef = useRef(null);
  const remoteSocketIdRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const localAudioStreamRef = useRef(null);
  const analyserRef = useRef(null);

  // totalUsers
  const totalUsers = useMemo(() => (state.remoteName ? 2 : 1), [state.remoteName]);

  // ================ ADD THESE FUNCTIONS ================
  // Detect available cameras
  const detectCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setCameras(videoDevices);
      
      console.log("📹 Available cameras:", videoDevices.map(cam => ({
        label: cam.label || `Camera ${cam.deviceId.slice(0, 8)}`,
        deviceId: cam.deviceId,
        facingMode: cam.label?.toLowerCase().includes('front') ? 'user' : 
                   cam.label?.toLowerCase().includes('back') ? 'environment' : 'user'
      })));
      
      if (videoDevices.length > 0) {
        // Check if any camera has facingMode info
        const frontCam = videoDevices.find(cam => 
          cam.label?.toLowerCase().includes('front') || 
          cam.label?.toLowerCase().includes('facing: user')
        );
        
        const backCam = videoDevices.find(cam => 
          cam.label?.toLowerCase().includes('back') || 
          cam.label?.toLowerCase().includes('facing: environment') ||
          cam.label?.toLowerCase().includes('rear')
        );
        
        if (frontCam) {
          setIsFrontCamera(true);
        } else if (backCam) {
          setIsFrontCamera(false);
        }
      }
    } catch (err) {
      console.error("Error detecting cameras:", err);
    }
  }, []);

  // Switch camera function
  const switchCamera = useCallback(async () => {
    if (cameras.length < 2) {
      toast.error("Only one camera available");
      return;
    }

    if (!state.myStream) {
      toast.error("No active camera stream");
      return;
    }

    try {
      // Calculate next camera index
      const nextIndex = (currentCameraIndex + 1) % cameras.length;
      const nextCamera = cameras[nextIndex];
      
      console.log("🔄 Switching to camera:", nextCamera.label || `Camera ${nextIndex + 1}`);
      
      // Get current audio track
      const audioTrack = state.myStream.getAudioTracks()[0];
      
      // Stop current video tracks
      state.myStream.getVideoTracks().forEach(track => track.stop());
      
      // Determine facing mode based on camera label
      const cameraLabel = nextCamera.label?.toLowerCase() || '';
      let facingMode = 'user'; // Default to front
      
      if (cameraLabel.includes('back') || cameraLabel.includes('rear') || 
          cameraLabel.includes('environment') || cameraLabel.includes('external')) {
        facingMode = 'environment';
        setIsFrontCamera(false);
        toast("📷 Switched to Back Camera", { icon: "🔄" });
      } else {
        setIsFrontCamera(true);
        toast("📷 Switched to Front Camera", { icon: "🔄" });
      }
      
      // Get new video stream with selected camera
      const constraints = {
        video: {
          deviceId: { exact: nextCamera.deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: facingMode,
        },
        audio: audioTrack ? {
          deviceId: audioTrack.getSettings().deviceId,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } : true
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Update state
      dispatch({ type: "SET_MY_STREAM", payload: newStream });
      setCurrentCameraIndex(nextIndex);
      
      // Update video element
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = newStream;
      }
      
      // Update peer connection
      if (sendStream) {
        await sendStream(newStream);
      }
      
      console.log(`✅ Switched to ${facingMode === 'user' ? 'front' : 'back'} camera`);
      
    } catch (err) {
      console.error("❌ Error switching camera:", err);
      toast.error("Failed to switch camera");
      
      // Try fallback with simpler constraints
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: state.cameraOn,
          audio: true
        });
        
        dispatch({ type: "SET_MY_STREAM", payload: fallbackStream });
        
        if (sendStream) {
          await sendStream(fallbackStream);
        }
        
        toast.success("Camera reset to default");
      } catch (fallbackErr) {
        console.error("Fallback also failed:", fallbackErr);
      }
    }
  }, [cameras, currentCameraIndex, state.myStream, sendStream, state.cameraOn]);

  // ================ UPDATE getUserMediaStream FUNCTION ================
  const getUserMediaStream = useCallback(async (useFrontCamera = true) => {
    try {
      console.log("🎥 Requesting camera and microphone access...");

      await detectCameras();

      // Get available cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      let selectedCamera = null;
      
      if (videoDevices.length > 0) {
        // Try to find front camera if requested
        if (useFrontCamera) {
          selectedCamera = videoDevices.find(device => 
            device.label?.toLowerCase().includes('front') ||
            device.label?.toLowerCase().includes('facing: user')
          ) || videoDevices[0];
          setIsFrontCamera(true);
        } else {
          // Try to find back camera
          selectedCamera = videoDevices.find(device => 
            device.label?.toLowerCase().includes('back') ||
            device.label?.toLowerCase().includes('facing: environment') ||
            device.label?.toLowerCase().includes('rear')
          ) || videoDevices[0];
          setIsFrontCamera(false);
        }
        
        setCurrentCameraIndex(videoDevices.findIndex(device => device.deviceId === selectedCamera.deviceId));
      }

      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: useFrontCamera ? "user" : "environment",
          ...(selectedCamera && { deviceId: { exact: selectedCamera.deviceId } })
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };

      console.log("📹 Camera constraints:", constraints.video);

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Verify camera info
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        console.log("📹 Camera settings:", settings);
        console.log("📹 Camera label:", videoTrack.label);
      }

      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach((track) => {
        const settings = track.getSettings();
        console.log("🔊 Audio settings after getUserMedia:", settings);

        track
          .applyConstraints({
            echoCancellation: true,
            noiseSuppression: true,
          })
          .catch((err) => {
            console.warn("Could not apply audio constraints:", err);
          });
      });

      console.log("✅ Media devices accessed successfully");
      dispatch({ type: "SET_MY_STREAM", payload: stream });

      if (myVideoRef.current) {
        myVideoRef.current.srcObject = stream;
        console.log("✅ Local video stream attached");
      }

      await sendStream(stream);
      dispatch({ type: "SET_STREAM_READY", payload: true });
      console.log("✅ Stream ready for WebRTC");

      if (pendingIncomingCall.current) {
        console.log("🔄 Processing pending incoming call...");
        handleIncomingCall(pendingIncomingCall.current);
        pendingIncomingCall.current = null;
      }
    } catch (err) {
      console.error("❌ Error accessing media devices:", err);

      if (err.name === "OverconstrainedError" || err.name === "ConstraintNotSatisfiedError") {
        try {
          console.log("🔄 Trying fallback constraints...");
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });

          dispatch({ type: "SET_MY_STREAM", payload: fallbackStream });
          await sendStream(fallbackStream);
          dispatch({ type: "SET_STREAM_READY", payload: true });
        } catch (fallbackErr) {
          console.error("Fallback also failed:", fallbackErr);
          toast.error("Please allow camera and microphone access");
        }
      } else {
        toast.error("Failed to access camera/microphone");
      }
    }
  }, [sendStream, handleIncomingCall, detectCameras]);

  // ================ UPDATE toggleCamera FUNCTION ================
  const toggleCamera = useCallback(async () => {
    if (!state.myStream) return;

    const newCameraState = !state.cameraOn;

    if (newCameraState) {
      // Turn camera ON
      if (state.myStream.getVideoTracks().length === 0) {
        // Need to get new stream with camera
        try {
          await getUserMediaStream(isFrontCamera);
        } catch (err) {
          console.error("Failed to enable camera:", err);
          toast.error("Failed to enable camera");
          return;
        }
      } else {
        // Enable existing track
        state.myStream.getVideoTracks().forEach((track) => {
          track.enabled = true;
          track.applyConstraints({
            facingMode: isFrontCamera ? 'user' : 'environment'
          }).catch(console.warn);
        });
      }
    } else {
      // Turn camera OFF - disable tracks but don't stop them
      state.myStream.getVideoTracks().forEach((track) => {
        track.enabled = false;
      });
    }

    dispatch({ type: "TOGGLE_CAMERA" });

    socket.emit("camera-toggle", {
      cameraOn: newCameraState,
      roomId,
    });

    toast(newCameraState ? "Camera ON" : "Camera OFF", {
      icon: newCameraState ? "📹" : "📵",
    });
  }, [state.myStream, state.cameraOn, socket, roomId, getUserMediaStream, isFrontCamera]);

  // ================ ADD cleanupEverything FUNCTION ================
  const cleanupEverything = useCallback(() => {
    console.log("🧹 Cleaning up all resources...");
    
    // Stop local stream
    if (state.myStream) {
      state.myStream.getTracks().forEach(track => track.stop());
    }
    
    // Stop remote stream
    if (remoteVideoRef.current?.srcObject) {
      remoteVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
    
    // Close peer connection
    if (peer) {
      peer.close();
    }
    
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
    }
    
    // Reset remote video
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    
    // Reset local video
    if (myVideoRef.current) {
      myVideoRef.current.srcObject = null;
    }
    
    // Reset call timer
    dispatch({ type: "END_CALL" });
    
    // Reset remote-related state
    dispatch({ type: "SET_REMOTE_NAME", payload: null });
    dispatch({ type: "SET_REMOTE_EMAIL", payload: null });
    dispatch({ type: "SET_REMOTE_CAMERA", payload: false });
    dispatch({ type: "SET_REMOTEVIDEOREADY", payload: false });
    
    // Reset camera state
    setCurrentCameraIndex(0);
    setIsFrontCamera(true);
  }, [state.myStream, peer]);

  // ================ UPDATE leaveRoom FUNCTION ================
  const leaveRoom = useCallback(() => {
    console.log("👋 Leaving room...");
    
    // Show leaving message
    toast.success("Leaving call...", {
      duration: 1500,
      icon: "👋",
    });
    
    // Notify server I'm leaving
    if (socket && roomId) {
      socket.emit("leave-room", { roomId });
    }
    
    // Clean up and redirect myself in 2 seconds
    setTimeout(() => {
      cleanupEverything();
      window.location.href = "/";
    }, 2000);
  }, [socket, roomId, cleanupEverything]);

  // ================ UPDATE useEffect FOR CAMERA DETECTION ================
  useEffect(() => {
    // Detect cameras on component mount
    detectCameras();
  }, [detectCameras]);

  // ================ ADD BEFOREUNLOAD HANDLER ================
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (socket && roomId) {
        socket.emit("leave-room", { roomId });
      }
    };
    
    window.addEventListener("beforeunload", handleBeforeUnload);
    
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [socket, roomId]);

  // ================ UPDATE Helper Functions ================
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

  // ================ KEEP OTHER FUNCTIONS SAME ================
  const handleIncomingCall = useCallback(
    async ({ from, offer, fromName }) => {
      dispatch({ type: "SET_REMOTE_EMAIL", payload: from });
      dispatch({ type: "SET_REMOTE_NAME", payload: fromName });

      remoteSocketIdRef.current = from;
      if (setRemoteSocketId) {
        setRemoteSocketId(from);
      }
      console.log("📲 Incoming call from socket ID:", from);

      if (!state.streamReady) {
        pendingIncomingCall.current = { from, offer, fromName };
        console.log("⏳ Stream not ready, incoming call pending...");
        return;
      }

      try {
        console.log("📝 Creating answer for:", from);
        const answer = await createAnswer(offer);
        socket.emit("call-accepted", {
          to: from,
          ans: answer,
        });
        console.log("📨 Answer sent to:", from);
      } catch (err) {
        console.error("❌ Error creating answer:", err);
      }
    },
    [createAnswer, socket, state.streamReady, setRemoteSocketId],
  );

  const handleNewUserJoined = useCallback(
    async ({ emailId, name, socketId }) => {
      dispatch({ type: "SET_REMOTE_EMAIL", payload: emailId });
      dispatch({ type: "SET_REMOTE_NAME", payload: name });

      remoteSocketIdRef.current = socketId;
      if (setRemoteSocketId) {
        setRemoteSocketId(socketId);
      }
      console.log("✅ Remote socket ID stored:", socketId);

      if (!state.streamReady) {
        pendingIncomingCall.current = { fromEmail: emailId, fromName: name, socketId };
        console.log("⏳ Stream not ready, call pending...");
        return;
      }

      try {
        console.log("📞 Creating offer for:", emailId);
        const offer = await createOffer();
        socket.emit("call-user", {
          emailId,
          offer,
          socketId: socketId,
        });
        console.log("📨 Offer sent to:", emailId);
      } catch (err) {
        console.error("❌ Error creating offer:", err);
      }
    },
    [createOffer, socket, state.streamReady, setRemoteSocketId],
  );

  const handleCallAccepted = useCallback(
    async ({ ans }) => {
      try {
        console.log("✅ Setting remote answer");
        await setRemoteAns(ans);
        console.log("✅ Remote answer set successfully");
      } catch (err) {
        console.error("❌ Error setting remote answer:", err);
      }
    },
    [setRemoteAns],
  );

  // Initial call to getUserMediaStream
  useEffect(() => {
    getUserMediaStream(true); // Start with front camera
  }, [getUserMediaStream]);

  // ================ UPDATE THE REST OF THE CODE ================
  // (Keep all other useEffect hooks and functions as they were)

  // ================ UPDATE UI - Add Camera Switch Button ================
  // In the return statement, update the bottom control bar:

  return (
    <div className="min-h-screen text-white flex bg-gradient-to-br from-gray-900 via-black to-blue-900">
      {/* ... (Keep header and video sections same as before) ... */}

      {/* BOTTOM CONTROL BAR - UPDATED WITH CAMERA SWITCH */}
      <div className="fixed flex flex-wrap w-full max-w-92 sm:max-w-xl justify-center place-items-center gap-2.5 sm:gap-4 bottom-6 left-1/2 z-10 -translate-x-1/2 bg-[#0b1018] backdrop-blur-lg sm:px-2 py-3 rounded-xl shadow-lg">
        {/* Camera Toggle */}
        <div
          onClick={toggleCamera}
          className={`p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer ${state.cameraOn ? "bg-gray-900" : ""} `}
          title="Toggle Camera"
        >
          {state.cameraOn ? <Camera /> : <CameraOff />}
        </div>

        {/* Camera Switch - Only show if multiple cameras available */}
        {cameras.length > 1 && (
          <div
            onClick={switchCamera}
            className="p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer"
            title={`Switch to ${isFrontCamera ? "Back" : "Front"} Camera`}
          >
            <FlipHorizontal2 className="w-5 h-5" />
          </div>
        )}

        {/* Mic Toggle */}
        <div
          onClick={toggleMic}
          className={`p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer ${state.micOn ? "bg-gray-900" : ""} `}
          title="Toggle Microphone"
        >
          {state.micOn ? <Mic /> : <MicOff />}
        </div>

        {/* Handfree/Speaker Toggle */}
        <div
          onClick={toggleHandfree}
          className={`p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer ${state.usingHandfree ? "bg-gray-900" : ""} `}
          title="Toggle Speaker/Headphone Mode"
        >
          {state.usingHandfree ? <Headphones /> : <Volume2 />}
        </div>

        {/* Chat Toggle */}
        <div
          onClick={handleChat}
          className={`relative p-3 rounded-full bg-[#364355] hover:bg-[#2e4361] cursor-pointer ${state.chatClose ? "bg-gray-900" : ""} `}
          title="Toggle Chat"
        >
          {state.chatClose ? <MessageSquareText /> : <MessageSquareOff />}
        </div>

        {/* Share Link */}
        <div
          onClick={copyMeetingLink}
          className="p-3 rounded-full bg-[#009776] hover:bg-[#048166] cursor-pointer"
          title="Share Meeting Link"
        >
          <Share2 className="w-5 h-5" />
        </div>

        {/* Leave Call */}
        <div
          onClick={leaveRoom}
          className="p-3 rounded-full bg-[#ea002e] hover:bg-[#c7082e] cursor-pointer"
          title="Leave Call"
        >
          <PhoneOff className="w-5 h-5" />
        </div>
      </div>

      {/* Camera Indicator (Optional - shows current camera) */}
      {state.cameraOn && cameras.length > 1 && (
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full z-20">
          {isFrontCamera ? "📱 Front Camera" : "📷 Back Camera"}
        </div>
      )}

      {/* ... (Rest of the UI remains same) ... */}
    </div>
  );
};

export default RoomPage;
