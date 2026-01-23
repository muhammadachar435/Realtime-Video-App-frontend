// PeerProvider.js
import { createContext, useContext, useRef, useEffect, useState } from "react";
import { useSocket } from "../providers/Socket";

const peerContext = createContext(null);

function PeerProvider({ children }) {
  const { socket } = useSocket();
  const peerRef = useRef(null);
  const remoteSocketIdRef = useRef(null);
  const [peerReady, setPeerReady] = useState(false);

  // Create peer connection only once
  useEffect(() => {
    if (peerRef.current) {
      console.log("⚠️ Peer already exists, skipping creation");
      return;
    }

    try {
      console.log("🔄 Creating new RTCPeerConnection...");
      
      const pc = new RTCPeerConnection({
        iceServers: [
          // STUN Servers - reduced list
          {
            urls: [
              "stun:stun.l.google.com:19302",
              "stun:global.stun.twilio.com:3478",
            ],
          },
          // TURN Server (Your ExpressTURN)
          {
            urls: "turn:free.expressturn.com:3478",
            username: "000000002084452952",
            credential: "aCNpyKTY3wZX1HLTGCh5XvUnyn4=",
          },
        ],
        iceCandidatePoolSize: 5, // Reduced from 10
        iceTransportPolicy: "all",
      });

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socket && remoteSocketIdRef.current) {
          socket.emit("ice-candidate", {
            to: remoteSocketIdRef.current,
            candidate: event.candidate,
          });
        }
      };

      // Handle ICE connection state
      pc.oniceconnectionstatechange = () => {
        console.log("ICE Connection State:", pc.iceConnectionState);
        if (pc.iceConnectionState === "failed") {
          console.log("ICE failed, restarting ICE...");
          setTimeout(() => {
            try {
              pc.restartIce();
            } catch (err) {
              console.error("Failed to restart ICE:", err);
            }
          }, 1000);
        }
      };

      // Handle connection state
      pc.onconnectionstatechange = () => {
        console.log("Peer Connection State:", pc.connectionState);
      };

      peerRef.current = pc;
      setPeerReady(true);
      console.log("✅ RTCPeerConnection created successfully");

    } catch (error) {
      console.error("❌ Failed to create RTCPeerConnection:", error);
      // Try with simpler configuration
      try {
        console.log("🔄 Trying simpler configuration...");
        const simplePc = new RTCPeerConnection({
          iceServers: [
            {
              urls: "stun:stun.l.google.com:19302"
            }
          ]
        });
        peerRef.current = simplePc;
        setPeerReady(true);
        console.log("✅ RTCPeerConnection created with simple config");
      } catch (simpleError) {
        console.error("❌ Failed with simple config too:", simpleError);
      }
    }

    // Cleanup on unmount
    return () => {
      if (peerRef.current) {
        console.log("🧹 Cleaning up RTCPeerConnection...");
        try {
          peerRef.current.close();
        } catch (err) {
          console.error("Error closing peer:", err);
        }
        peerRef.current = null;
        setPeerReady(false);
      }
    };
  }, [socket]);

  // Store remote socket ID
  const setRemoteSocketId = (socketId) => {
    remoteSocketIdRef.current = socketId;
  };

  const createOffer = async (remoteSocketId) => {
    if (!peerRef.current) {
      throw new Error("Peer connection not ready");
    }

    try {
      setRemoteSocketId(remoteSocketId);
      const offer = await peerRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await peerRef.current.setLocalDescription(offer);
      return offer;
    } catch (error) {
      console.error("Error creating offer:", error);
      throw error;
    }
  };

  const createAnswer = async (offer) => {
    if (!peerRef.current) {
      throw new Error("Peer connection not ready");
    }

    try {
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerRef.current.createAnswer();
      await peerRef.current.setLocalDescription(answer);
      return answer;
    } catch (error) {
      console.error("Error creating answer:", error);
      throw error;
    }
  };

  const setRemoteAns = async (ans) => {
    if (!peerRef.current) {
      throw new Error("Peer connection not ready");
    }

    try {
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(ans));
    } catch (error) {
      console.error("Error setting remote answer:", error);
      throw error;
    }
  };

  const sendStream = async (stream) => {
    if (!peerRef.current) {
      throw new Error("Peer connection not ready");
    }

    try {
      const currentSenders = peerRef.current.getSenders();
      
      stream.getTracks().forEach((track) => {
        // Check if track already exists
        const existingSender = currentSenders.find(
          sender => sender.track && sender.track.kind === track.kind
        );
        
        if (existingSender) {
          // Replace track in existing sender
          existingSender.replaceTrack(track);
          console.log(`🔄 Replaced ${track.kind} track`);
        } else {
          // Add new track
          peerRef.current.addTrack(track, stream);
          console.log(`➕ Added new ${track.kind} track`);
        }
      });

      console.log("✅ Stream synchronized with peer connection");
    } catch (error) {
      console.error("Error sending stream:", error);
      throw error;
    }
  };

  // Provide peer object only when ready
  const value = {
    peer: peerRef.current,
    createOffer,
    createAnswer,
    setRemoteAns,
    sendStream,
    setRemoteSocketId,
    peerReady,
  };

  return (
    <peerContext.Provider value={value}>
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
