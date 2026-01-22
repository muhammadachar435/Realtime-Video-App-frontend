import { createContext, useContext, useMemo, useEffect, useRef } from "react";
import { useSocket } from "../providers/Socket";

const PeerContext = createContext(null);

export function PeerProvider({ children }) {
  const { socket } = useSocket();
  const peerRef = useRef(null);

  const createPeerConnection = () => {
    // ✅ SIMPLE & RELIABLE ICE SERVERS
    const iceServers = {
      iceServers: [
        // Free STUN servers
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        
        // Free TURN servers that WORK
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject"
        },
        {
          urls: "turn:openrelay.metered.ca:443",
          username: "openrelayproject",
          credential: "openrelayproject"
        }
      ],
      iceCandidatePoolSize: 10
    };

    const pc = new RTCPeerConnection(iceServers);
    
    console.log("✅ PeerConnection created");

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        console.log("📤 ICE candidate generated");
        // We'll send this when we have a remote socket ID
      }
    };

    // Handle connection state
    pc.onconnectionstatechange = () => {
      console.log(`Connection state: ${pc.connectionState}`);
    };

    // Handle ICE connection state
    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state: ${pc.iceConnectionState}`);
    };

    // Handle when connection is established
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "connected") {
        console.log("🎉 WebRTC connection established!");
      }
    };

    // Handle incoming tracks (remote video/audio)
    pc.ontrack = (event) => {
      console.log("📹 Remote track received:", event.track.kind);
      if (event.streams && event.streams[0]) {
        // This will be handled by the component
        console.log("✅ Remote stream received with", event.streams[0].getTracks().length, "tracks");
      }
    };

    peerRef.current = pc;
    return pc;
  };

  const peer = useMemo(() => createPeerConnection(), [socket]);

  // Send ICE candidate to remote peer
  const sendIceCandidate = (candidate, remoteSocketId) => {
    if (socket && remoteSocketId) {
      socket.emit("ice-candidate", {
        to: remoteSocketId,
        candidate: candidate
      });
    }
  };

  // Create offer and set up ICE candidate sending
  const createOffer = async (remoteSocketId) => {
    try {
      console.log("Creating offer for:", remoteSocketId);
      
      // Set up ICE candidate handler for this specific remote
      peer.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit("ice-candidate", {
            to: remoteSocketId,
            candidate: event.candidate
          });
        }
      };

      const offer = await peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await peer.setLocalDescription(offer);
      console.log("✅ Offer created");
      
      return offer;
    } catch (error) {
      console.error("❌ Error creating offer:", error);
      throw error;
    }
  };

  // Create answer
  const createAnswer = async (offer, remoteSocketId) => {
    try {
      console.log("Creating answer");
      
      // Set up ICE candidate handler
      peer.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit("ice-candidate", {
            to: remoteSocketId,
            candidate: event.candidate
          });
        }
      };

      await peer.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      console.log("✅ Answer created");
      
      return answer;
    } catch (error) {
      console.error("❌ Error creating answer:", error);
      throw error;
    }
  };

  // Set remote answer
  const setRemoteAnswer = async (answer) => {
    try {
      await peer.setRemoteDescription(new RTCSessionDescription(answer));
      console.log("✅ Remote answer set");
    } catch (error) {
      console.error("❌ Error setting remote answer:", error);
      throw error;
    }
  };

  // Add local stream to peer connection
  const addStream = (stream) => {
    if (!peer || !stream) return;
    
    // Remove existing tracks
    const senders = peer.getSenders();
    senders.forEach(sender => {
      if (sender.track) {
        peer.removeTrack(sender);
      }
    });
    
    // Add all tracks from stream
    stream.getTracks().forEach(track => {
      peer.addTrack(track, stream);
    });
    
    console.log(`✅ Added ${stream.getTracks().length} tracks to peer`);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (peerRef.current) {
        peerRef.current.close();
        console.log("🧹 Peer connection cleaned up");
      }
    };
  }, []);

  return (
    <PeerContext.Provider value={{
      peer,
      createOffer,
      createAnswer,
      setRemoteAnswer,
      addStream,
      sendIceCandidate
    }}>
      {children}
    </PeerContext.Provider>
  );
}

export const usePeer = () => {
  const context = useContext(PeerContext);
  if (!context) {
    throw new Error("usePeer must be used within PeerProvider");
  }
  return context;
};
