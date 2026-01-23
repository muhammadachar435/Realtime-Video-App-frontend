import { createContext, useContext, useMemo, useEffect, useRef, useState, useCallback } from "react";
import { useSocket } from "../providers/Socket";

const peerContext = createContext(null);

function PeerProvider({ children }) {
  const { socket } = useSocket();
  const peerRef = useRef(null);
  const remoteSocketIdRef = useRef(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const dataChannelRef = useRef(null);

  // Create new peer connection
  const createPeerConnection = useCallback((remoteSocketId = null) => {
    try {
      console.log("🔄 Creating new peer connection for:", remoteSocketId);
      
      // Close existing connection if any
      if (peerRef.current) {
        peerRef.current.close();
      }

      const pc = new RTCPeerConnection({
        iceServers: [
          // STUN Servers
          {
            urls: [
              "stun:stun.l.google.com:19302",
              "stun:global.stun.twilio.com:3478",
              "stun:stun1.l.google.com:19302",
              "stun:stun2.l.google.com:19302",
              "stun:stun3.l.google.com:19302",
              "stun:stun4.l.google.com:19302",
            ],
          },
          // TURN Servers for cross-network connectivity
          {
            urls: "turn:free.expressturn.com:3478",
            username: "000000002084452952",
            credential: "aCNpyKTY3wZX1HLTGCh5XvUnyn4="
          },
          {
            urls: "turn:numb.viagenie.ca:3478",
            username: "webrtc@live.com",
            credential: "muazkh"
          }
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: "all", // Try both relay and host candidates
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      });

      // Handle ICE candidates - CRITICAL FIX
      pc.onicecandidate = (event) => {
        if (event.candidate && socket && remoteSocketIdRef.current) {
          console.log("📤 Sending ICE candidate to:", remoteSocketIdRef.current, event.candidate);
          socket.emit("ice-candidate", {
            to: remoteSocketIdRef.current,
            candidate: event.candidate,
          });
        } else if (!event.candidate) {
          console.log("✅ All ICE candidates gathered");
        }
      };

      // Handle ICE connection state
      pc.oniceconnectionstatechange = () => {
        console.log("❄️ ICE Connection State:", pc.iceConnectionState);
        if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
          console.log("🔄 ICE connection issues, trying to reconnect...");
          // Don't restart automatically - let UI handle reconnection
        }
      };

      // Handle connection state
      pc.onconnectionstatechange = () => {
        console.log("🔗 Connection State:", pc.connectionState);
      };

      // Handle signaling state
      pc.onsignalingstatechange = () => {
        console.log("📡 Signaling State:", pc.signalingState);
      };

      // Handle track events
      pc.ontrack = (event) => {
        console.log("🎬 Received remote track:", event.streams[0]);
        // Remote stream will be handled in RoomPage
      };

      // Create data channel for messaging
      try {
        const dataChannel = pc.createDataChannel("chat");
        dataChannelRef.current = dataChannel;
        
        dataChannel.onopen = () => {
          console.log("📨 Data channel opened");
        };
        
        dataChannel.onclose = () => {
          console.log("📨 Data channel closed");
        };
        
        dataChannel.onerror = (error) => {
          console.error("📨 Data channel error:", error);
        };
      } catch (err) {
        console.warn("Could not create data channel:", err);
      }

      peerRef.current = pc;
      setPeerConnection(pc);
      
      return pc;
    } catch (error) {
      console.error("❌ Error creating peer connection:", error);
      throw error;
    }
  }, [socket]);

  // Initialize with a basic peer connection
  const peer = useMemo(() => {
    return createPeerConnection();
  }, [createPeerConnection]);

  // Store remote socket ID
  const setRemoteSocketId = useCallback((socketId) => {
    console.log("💾 Setting remote socket ID:", socketId);
    remoteSocketIdRef.current = socketId;
  }, []);

  // Reset peer connection
  const resetPeerConnection = useCallback(() => {
    console.log("🔄 Resetting peer connection");
    if (peerRef.current) {
      peerRef.current.close();
    }
    const newPeer = createPeerConnection();
    setPeerConnection(newPeer);
    return newPeer;
  }, [createPeerConnection]);

  const createOffer = async (remoteSocketId) => {
    try {
      console.log("📞 Creating offer for:", remoteSocketId);
      setRemoteSocketId(remoteSocketId);
      
      // Ensure we have a valid connection
      if (!peerRef.current || peerRef.current.signalingState === 'closed') {
        createPeerConnection(remoteSocketId);
      }
      
      const offer = await peerRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        voiceActivityDetection: true
      });
      
      await peerRef.current.setLocalDescription(offer);
      console.log("✅ Offer created:", offer.type);
      return offer;
    } catch (error) {
      console.error("❌ Error creating offer:", error);
      throw error;
    }
  };

  const createAnswer = async (offer, remoteSocketId) => {
    try {
      console.log("📝 Creating answer for:", remoteSocketId);
      setRemoteSocketId(remoteSocketId);
      
      // Ensure we have a valid connection
      if (!peerRef.current || peerRef.current.signalingState === 'closed') {
        createPeerConnection(remoteSocketId);
      }
      
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerRef.current.createAnswer({
        voiceActivityDetection: true
      });
      await peerRef.current.setLocalDescription(answer);
      console.log("✅ Answer created:", answer.type);
      return answer;
    } catch (error) {
      console.error("❌ Error creating answer:", error);
      throw error;
    }
  };

  const setRemoteAns = async (ans) => {
    try {
      console.log("✅ Setting remote answer");
      if (!peerRef.current) {
        throw new Error("No peer connection available");
      }
      
      // Check if we already have a remote description
      if (peerRef.current.remoteDescription) {
        console.log("ℹ️ Remote description already set, skipping...");
        return;
      }
      
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(ans));
      console.log("✅ Remote answer set successfully");
    } catch (error) {
      console.error("❌ Error setting remote answer:", error);
      throw error;
    }
  };

  const sendStream = async (stream) => {
    try {
      console.log("🎬 Sending stream to peer connection");
      
      // Clear existing senders
      const senders = peerRef.current.getSenders();
      senders.forEach((sender) => {
        if (sender.track) {
          peerRef.current.removeTrack(sender);
        }
      });

      // Add new tracks with proper encoding
      stream.getTracks().forEach((track) => {
        const sender = peerRef.current.addTrack(track, stream);
        
        // Set encoding parameters for better quality
        if (sender && track.kind === 'video') {
          const params = sender.getParameters();
          if (!params) return;
          
          params.encodings = [{
            rid: 'h',
            active: true,
            maxBitrate: 500000, // 500 kbps
            scaleResolutionDownBy: 1
          }];
          
          sender.setParameters(params).catch(console.warn);
        }
      });

      console.log("✅ Stream tracks added to peer connection");
    } catch (error) {
      console.error("❌ Error sending stream:", error);
      throw error;
    }
  };

  // Add ICE candidate
  const addIceCandidate = async (candidate) => {
    try {
      if (peerRef.current && peerRef.current.remoteDescription) {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("✅ ICE candidate added");
      } else {
        console.warn("⚠️ Cannot add ICE candidate - no remote description");
      }
    } catch (error) {
      console.error("❌ Error adding ICE candidate:", error);
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      console.log("🧹 Cleaning up peer connection");
      if (peerRef.current) {
        peerRef.current.close();
      }
      if (dataChannelRef.current) {
        dataChannelRef.current.close();
      }
    };
  }, []);

  return (
    <peerContext.Provider
      value={{
        peer: peerConnection || peer,
        createOffer,
        createAnswer,
        setRemoteAns,
        sendStream,
        setRemoteSocketId,
        resetPeerConnection,
        addIceCandidate,
        dataChannel: dataChannelRef.current
      }}
    >
      {children}
    </peerContext.Provider>
  );
}

export default PeerProvider;

export const usePeer = () => {
  const context = useContext(peerContext);
  if (!context) {
    throw new Error("usePeer must be used within PeerProvider");
  }
  return context;
};
