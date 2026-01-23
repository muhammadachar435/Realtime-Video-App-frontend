// PeerProvider.js
import { createContext, useContext, useRef, useEffect, useState, useCallback } from "react";
import { useSocket } from "../providers/Socket";

const peerContext = createContext(null);

function PeerProvider({ children }) {
  const { socket } = useSocket();
  const peerRef = useRef(null);
  const remoteSocketIdRef = useRef(null);
  const [peerReady, setPeerReady] = useState(false);
  const isConnectionClosed = useRef(false);
  const localStreamRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 3;

  // Check if peer connection is valid and open
  const isPeerConnectionValid = useCallback(() => {
    return peerRef.current && 
           peerRef.current.connectionState !== 'closed' && 
           peerRef.current.signalingState !== 'closed' &&
           !isConnectionClosed.current;
  }, []);

  // Create or recreate peer connection
  const createPeerConnection = useCallback(() => {
    console.log("🔄 Creating/Recreating RTCPeerConnection...");
    
    // Close existing connection if any
    if (peerRef.current) {
      try {
        isConnectionClosed.current = true;
        peerRef.current.onicecandidate = null;
        peerRef.current.oniceconnectionstatechange = null;
        peerRef.current.onconnectionstatechange = null;
        peerRef.current.ontrack = null;
        peerRef.current.onnegotiationneeded = null;
        peerRef.current.close();
      } catch (err) {
        console.error("Error closing old peer connection:", err);
      }
      peerRef.current = null;
    }

    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          {
            urls: [
              "stun:stun.l.google.com:19302",
              "stun:stun1.l.google.com:19302",
              "stun:stun2.l.google.com:19302",
              "stun:stun3.l.google.com:19302",
              "stun:stun4.l.google.com:19302",
            ]
          },
          // TURN server
          {
            urls: "turn:free.expressturn.com:3478",
            username: "000000002084452952",
            credential: "aCNpyKTY3wZX1HLTGCh5XvUnyn4=",
          }
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: "all"
      });

      // Store peer reference
      peerRef.current = pc;
      isConnectionClosed.current = false;
      reconnectAttempts.current = 0;

      // ICE candidate handler
      pc.onicecandidate = (event) => {
        if (event.candidate && socket && remoteSocketIdRef.current && isPeerConnectionValid()) {
          console.log("📤 Sending ICE candidate");
          socket.emit("ice-candidate", {
            to: remoteSocketIdRef.current,
            candidate: event.candidate,
          });
        }
      };

      // ICE connection state change handler
      pc.oniceconnectionstatechange = () => {
        console.log("❄️ ICE Connection State:", pc.iceConnectionState);
        
        switch(pc.iceConnectionState) {
          case 'connected':
            console.log("✅ ICE connected successfully");
            reconnectAttempts.current = 0;
            break;
          case 'disconnected':
            console.log("⚠️ ICE disconnected");
            break;
          case 'failed':
            console.log("❌ ICE failed");
            if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
              reconnectAttempts.current++;
              console.log(`🔄 Attempting ICE restart (${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS})`);
              setTimeout(() => {
                if (isPeerConnectionValid()) {
                  pc.restartIce();
                }
              }, 1000);
            }
            break;
          case 'closed':
            console.log("🚫 ICE connection closed");
            isConnectionClosed.current = true;
            break;
        }
      };

      // Peer connection state change handler
      pc.onconnectionstatechange = () => {
        console.log("🔗 Peer Connection State:", pc.connectionState);
        
        if (pc.connectionState === 'connected') {
          console.log("✅ Peer-to-peer connection established!");
          setPeerReady(true);
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          console.log("⚠️ Connection issue, will attempt to reconnect...");
          setPeerReady(false);
        } else if (pc.connectionState === 'closed') {
          console.log("🚫 Peer connection closed");
          isConnectionClosed.current = true;
          setPeerReady(false);
        }
      };

      // Track handler for incoming media
      pc.ontrack = (event) => {
        console.log("📥 Received remote track:", event.track.kind);
        // This will be handled by the RoomPage component
      };

      console.log("✅ RTCPeerConnection created successfully");
      return pc;
    } catch (error) {
      console.error("❌ Failed to create RTCPeerConnection:", error);
      return null;
    }
  }, [socket, isPeerConnectionValid]);

  // Initialize peer connection
  useEffect(() => {
    const pc = createPeerConnection();
    
    // Cleanup on unmount
    return () => {
      if (pc) {
        console.log("🧹 Cleaning up RTCPeerConnection on unmount");
        try {
          pc.close();
        } catch (err) {
          console.error("Error closing peer:", err);
        }
      }
    };
  }, [createPeerConnection]);

  // Store remote socket ID
  const setRemoteSocketId = useCallback((socketId) => {
    console.log("📝 Setting remote socket ID:", socketId);
    remoteSocketIdRef.current = socketId;
  }, []);

  // Create offer with robust error handling
  const createOffer = useCallback(async () => {
    console.log("📞 Attempting to create offer...");
    
    // Ensure we have a valid peer connection
    if (!isPeerConnectionValid()) {
      console.log("⚠️ Peer connection invalid, recreating...");
      createPeerConnection();
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!peerRef.current) {
      throw new Error("Peer connection not available");
    }

    try {
      // Check current state
      console.log("📶 Current signaling state:", peerRef.current.signalingState);
      
      const offer = await peerRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: true
      });
      
      await peerRef.current.setLocalDescription(offer);
      console.log("✅ Offer created successfully");
      return offer;
    } catch (error) {
      console.error("❌ Error creating offer:", error);
      
      // If connection is closed, recreate it and retry once
      if (error.message.includes('closed') || peerRef.current?.signalingState === 'closed') {
        console.log("🔄 Connection was closed, recreating...");
        createPeerConnection();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Retry creating offer
        try {
          const retryOffer = await peerRef.current.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          await peerRef.current.setLocalDescription(retryOffer);
          console.log("✅ Offer created after retry");
          return retryOffer;
        } catch (retryError) {
          console.error("❌ Failed to create offer after retry:", retryError);
          throw retryError;
        }
      }
      
      throw error;
    }
  }, [createPeerConnection, isPeerConnectionValid]);

  // Create answer with robust error handling
  const createAnswer = useCallback(async (offer) => {
    console.log("📝 Attempting to create answer...");
    
    // Ensure we have a valid peer connection
    if (!isPeerConnectionValid()) {
      console.log("⚠️ Peer connection invalid, recreating...");
      createPeerConnection();
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!peerRef.current) {
      throw new Error("Peer connection not available");
    }

    try {
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerRef.current.createAnswer();
      await peerRef.current.setLocalDescription(answer);
      console.log("✅ Answer created successfully");
      return answer;
    } catch (error) {
      console.error("❌ Error creating answer:", error);
      
      // If connection is closed, recreate it and retry once
      if (error.message.includes('closed') || peerRef.current?.signalingState === 'closed') {
        console.log("🔄 Connection was closed, recreating...");
        createPeerConnection();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Retry
        try {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(offer));
          const retryAnswer = await peerRef.current.createAnswer();
          await peerRef.current.setLocalDescription(retryAnswer);
          console.log("✅ Answer created after retry");
          return retryAnswer;
        } catch (retryError) {
          console.error("❌ Failed to create answer after retry:", retryError);
          throw retryError;
        }
      }
      
      throw error;
    }
  }, [createPeerConnection, isPeerConnectionValid]);

  // Set remote answer
  const setRemoteAns = useCallback(async (ans) => {
    console.log("✅ Setting remote answer...");
    
    if (!peerRef.current || !isPeerConnectionValid()) {
      throw new Error("Peer connection not ready");
    }

    try {
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(ans));
      console.log("✅ Remote answer set successfully");
      
      // Send local stream if we have one
      if (localStreamRef.current) {
        console.log("🔄 Sending local stream after answer...");
        await sendStream(localStreamRef.current);
      }
    } catch (error) {
      console.error("❌ Error setting remote answer:", error);
      throw error;
    }
  }, [isPeerConnectionValid]);

  // Send stream to peer connection
  const sendStream = useCallback(async (stream) => {
    console.log("📤 Sending stream to peer...");
    
    // Store stream for reconnection
    localStreamRef.current = stream;
    
    if (!peerRef.current || !isPeerConnectionValid()) {
      console.log("⚠️ Peer connection not ready, storing stream for later");
      return;
    }

    try {
      // Clear existing tracks
      const senders = peerRef.current.getSenders();
      senders.forEach(sender => {
        if (sender.track) {
          peerRef.current.removeTrack(sender);
        }
      });

      // Add new tracks
      stream.getTracks().forEach(track => {
        try {
          peerRef.current.addTrack(track, stream);
          console.log(`➕ Added ${track.kind} track`);
        } catch (err) {
          console.error(`❌ Failed to add ${track.kind} track:`, err);
        }
      });

      console.log("✅ Stream sent successfully");
    } catch (error) {
      console.error("❌ Error sending stream:", error);
      throw error;
    }
  }, [isPeerConnectionValid]);

  // Reset peer connection (for manual reconnection)
  const resetPeerConnection = useCallback(() => {
    console.log("🔄 Manual peer connection reset");
    createPeerConnection();
    
    // Resend stream if we have one
    if (localStreamRef.current) {
      setTimeout(() => {
        sendStream(localStreamRef.current);
      }, 500);
    }
  }, [createPeerConnection, sendStream]);

  // Provide context value
  const value = {
    peer: peerRef.current,
    createOffer,
    createAnswer,
    setRemoteAns,
    sendStream,
    setRemoteSocketId,
    peerReady,
    resetPeerConnection,
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
