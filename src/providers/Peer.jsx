// /* eslint-disable react-hooks/exhaustive-deps */
// import { createContext, useContext, useMemo, useEffect, useRef } from "react";
// import { useSocket } from "../providers/Socket";

// // Create Context
// const peerContext = createContext(null);

// // PeerProvider Component
// function PeerProvider({ children }) {
//   const { socket } = useSocket();
//   const peerRef = useRef(null);
//   const remoteSocketIdRef = useRef(null); // Will store the remote user's socket ID

//   // Initialize PeerConnection
//   const peer = useMemo(() => {
//     const pc = new RTCPeerConnection({
//       iceServers: [
//         { urls: ["stun:stun.l.google.com:19302"] },
//         { urls: ["stun:global.stun.twilio.com:3478"] },
//       ],
//     });

//     // ----------------- ICE Candidate Handling -----------------
//     pc.onicecandidate = (event) => {
//       if (event.candidate && socket && remoteSocketIdRef.current) {
//         socket.emit("ice-candidate", {
//           to: remoteSocketIdRef.current,
//           candidate: event.candidate,
//         });
//       }
//     };

//     return pc;
//   }, [socket]);

//   // ----------------- Remote ICE Candidate Listener -----------------
//   useEffect(() => {
//     if (!socket) return;

//     const handleRemoteIce = ({ candidate, from }) => {
//       if (candidate && peer && peer.remoteDescription) {
//         peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
//       }
//       // Track remote socket ID for future ICE candidates
//       if (from) remoteSocketIdRef.current = from;
//     };

//     socket.on("ice-candidate", handleRemoteIce);
//     return () => socket.off("ice-candidate", handleRemoteIce);
//   }, [socket, peer]);

//   // ----------------- Create Offer -----------------
//   const createOffer = async (remoteSocketId) => {
//     try {
//       remoteSocketIdRef.current = remoteSocketId; // Save remote socket ID
//       const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
//       await peer.setLocalDescription(offer);
//       return offer;
//     } catch (err) {
//       console.error("Error creating offer:", err);
//       throw err;
//     }
//   };

//   // ----------------- Create Answer -----------------
//   const createAnswer = async (offer, remoteSocketId) => {
//     try {
//       remoteSocketIdRef.current = remoteSocketId; // Save remote socket ID
//       await peer.setRemoteDescription(offer);
//       const answer = await peer.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
//       await peer.setLocalDescription(answer);
//       return answer;
//     } catch (err) {
//       console.error("Error creating answer:", err);
//       throw err;
//     }
//   };

//   // ----------------- Set Remote Answer -----------------
//   const setRemoteAns = async (answer) => {
//     try {
//       await peer.setRemoteDescription(answer);
//     } catch (err) {
//       console.error("Error setting remote answer:", err);
//       throw err;
//     }
//   };

//   // ----------------- Send Media Stream -----------------
//   const sendStream = async (stream) => {
//     try {
//       // Remove previous tracks
//       peer.getSenders().forEach((sender) => {
//         if (sender.track) peer.removeTrack(sender);
//       });

//       // Add new tracks
//       stream.getTracks().forEach((track) => peer.addTrack(track, stream));
//     } catch (err) {
//       console.error("Error sending stream:", err);
//       throw err;
//     }
//   };

//   // ----------------- Cleanup on Unmount -----------------
//   useEffect(() => {
//     return () => {
//       if (peer) peer.close();
//       if (socket) socket.off("ice-candidate");
//     };
//   }, [peer, socket]);

//   return (
//     <peerContext.Provider
//       value={{
//         peer,
//         createOffer,
//         createAnswer,
//         setRemoteAns,
//         sendStream,
//       }}
//     >
//       {children}
//     </peerContext.Provider>
//   );
// }

// export default PeerProvider;

// // ----------------- usePeer Hook -----------------
// export const usePeer = () => {
//   const context = useContext(peerContext);
//   if (!context) {
//     throw new Error("usePeer must be used within PeerProvider");
//   }
//   return context;
// };




/* eslint-disable react-hooks/exhaustive-deps */
import { createContext, useContext, useMemo, useEffect, useRef, useState } from "react";
import { useSocket } from "../providers/Socket";

// Create Context
const peerContext = createContext(null);

// PeerProvider Component
function PeerProvider({ children }) {
  const { socket } = useSocket();
  const peerRef = useRef(null);
  const remoteSocketIdRef = useRef(null);
  const [connectionState, setConnectionState] = useState("new");
  const [iceState, setIceState] = useState("new");

  // Initialize PeerConnection
  const peer = useMemo(() => {
    console.log("Creating new RTCPeerConnection");
    
    const pc = new RTCPeerConnection({
      iceServers: [
        // Multiple STUN servers for reliability
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" },
        
        // Free TURN servers for NAT traversal (mobile compatibility)
        {
          urls: "turn:numb.viagenie.ca",
          credential: "muazkh",
          username: "webrtc@live.com"
        },
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject"
        },
        {
          urls: "turn:openrelay.metered.ca:443",
          username: "openrelayproject",
          credential: "openrelayproject"
        },
        {
          urls: "turn:openrelay.metered.ca:443?transport=tcp",
          username: "openrelayproject",
          credential: "openrelayproject"
        }
      ],
      iceCandidatePoolSize: 10,
      iceTransportPolicy: "all", // Try both relay and host candidates
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require"
    });

    // ----------------- Debug Logging -----------------
    pc.addEventListener("connectionstatechange", () => {
      console.log("Peer connection state:", pc.connectionState);
      setConnectionState(pc.connectionState);
    });

    pc.addEventListener("iceconnectionstatechange", () => {
      console.log("ICE connection state:", pc.iceConnectionState);
      setIceState(pc.iceConnectionState);
      
      if (pc.iceConnectionState === "failed") {
        console.error("ICE connection failed! Attempting restart...");
        // Could implement ICE restart here if needed
      }
      
      if (pc.iceConnectionState === "connected") {
        console.log("✅ ICE Connected successfully!");
      }
      
      if (pc.iceConnectionState === "completed") {
        console.log("✅ ICE Completed!");
      }
    });

    pc.addEventListener("icegatheringstatechange", () => {
      console.log("ICE gathering state:", pc.iceGatheringState);
    });

    pc.addEventListener("signalingstatechange", () => {
      console.log("Signaling state:", pc.signalingState);
    });

    pc.addEventListener("negotiationneeded", () => {
      console.log("Negotiation needed");
    });

    // ----------------- ICE Candidate Handling -----------------
    pc.onicecandidate = (event) => {
      console.log("ICE Candidate event:", event.candidate ? "candidate found" : "end of candidates");
      
      if (event.candidate) {
        console.log("ICE Candidate type:", event.candidate.type, 
                   "protocol:", event.candidate.protocol,
                   "address:", event.candidate.address);
        
        // Send to remote peer via socket
        if (socket && remoteSocketIdRef.current) {
          socket.emit("ice-candidate", {
            to: remoteSocketIdRef.current,
            candidate: event.candidate,
            from: socket.id
          });
        }
      } else {
        console.log("✅ All ICE candidates gathered");
      }
    };

    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log("📹 Track received:", event.track.kind, "from remote");
      console.log("Streams received:", event.streams.length);
      
      // This is handled by the RoomPage component
      // The track event will bubble up to the RoomPage's event listener
    };

    // Store reference
    peerRef.current = pc;
    return pc;
  }, [socket]);

  // ----------------- Remote ICE Candidate Listener -----------------
  useEffect(() => {
    if (!socket) {
      console.log("Socket not available");
      return;
    }

    console.log("Setting up ICE candidate listener");

    const handleRemoteIce = ({ candidate, from }) => {
      console.log("Received remote ICE candidate from:", from);
      
      if (candidate && peer && peer.remoteDescription) {
        console.log("Adding remote ICE candidate");
        peer.addIceCandidate(new RTCIceCandidate(candidate))
          .then(() => {
            console.log("✅ Remote ICE candidate added successfully");
          })
          .catch((err) => {
            console.error("❌ Failed to add remote ICE candidate:", err);
          });
      } else {
        if (!peer) console.log("Peer not available");
        if (!peer?.remoteDescription) console.log("Remote description not set");
        console.log("Candidate data:", candidate);
      }
      
      // Track remote socket ID for future ICE candidates
      if (from) {
        remoteSocketIdRef.current = from;
        console.log("Remote socket ID set to:", from);
      }
    };

    socket.on("ice-candidate", handleRemoteIce);
    
    return () => {
      console.log("Cleaning up ICE candidate listener");
      socket.off("ice-candidate", handleRemoteIce);
    };
  }, [socket, peer]);

  // ----------------- Create Offer -----------------
  const createOffer = async (remoteSocketId) => {
    console.log("Creating offer for remote socket:", remoteSocketId);
    
    try {
      if (!peer) {
        throw new Error("Peer connection not initialized");
      }

      remoteSocketIdRef.current = remoteSocketId; // Save remote socket ID
      
      // Create offer with proper options
      const offerOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: false
      };
      
      console.log("Creating offer with options:", offerOptions);
      const offer = await peer.createOffer(offerOptions);
      
      console.log("Offer created, setting local description");
      await peer.setLocalDescription(offer);
      
      console.log("✅ Offer created successfully:", offer.type);
      return offer;
      
    } catch (err) {
      console.error("❌ Error creating offer:", err);
      console.error("Error stack:", err.stack);
      throw err;
    }
  };

  // ----------------- Create Answer -----------------
  const createAnswer = async (offer, remoteSocketId) => {
    console.log("Creating answer for remote socket:", remoteSocketId);
    console.log("Received offer type:", offer.type);
    
    try {
      if (!peer) {
        throw new Error("Peer connection not initialized");
      }

      remoteSocketIdRef.current = remoteSocketId; // Save remote socket ID
      
      // Set remote description first
      console.log("Setting remote description");
      await peer.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Create answer
      const answerOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      };
      
      console.log("Creating answer with options:", answerOptions);
      const answer = await peer.createAnswer(answerOptions);
      
      console.log("Answer created, setting local description");
      await peer.setLocalDescription(answer);
      
      console.log("✅ Answer created successfully:", answer.type);
      return answer;
      
    } catch (err) {
      console.error("❌ Error creating answer:", err);
      console.error("Error details:", {
        errName: err.name,
        errMessage: err.message,
        offerType: offer?.type,
        peerState: peer?.signalingState
      });
      throw err;
    }
  };

  // ----------------- Set Remote Answer -----------------
  const setRemoteAns = async (answer) => {
    console.log("Setting remote answer");
    console.log("Answer type:", answer.type);
    console.log("Current signaling state:", peer.signalingState);
    
    try {
      if (!peer) {
        throw new Error("Peer connection not initialized");
      }

      await peer.setRemoteDescription(new RTCSessionDescription(answer));
      console.log("✅ Remote answer set successfully");
      
    } catch (err) {
      console.error("❌ Error setting remote answer:", err);
      console.error("Error details:", {
        errName: err.name,
        errMessage: err.message,
        currentSD: peer.remoteDescription?.type,
        newSD: answer?.type
      });
      throw err;
    }
  };

  // ----------------- Send Media Stream -----------------
  const sendStream = async (stream) => {
    console.log("Sending stream to peer");
    console.log("Stream tracks:", {
      video: stream.getVideoTracks().length,
      audio: stream.getAudioTracks().length
    });
    
    try {
      if (!peer) {
        throw new Error("Peer connection not initialized");
      }

      // Clear existing senders
      const senders = peer.getSenders();
      console.log("Existing senders:", senders.length);
      
      senders.forEach((sender) => {
        if (sender.track) {
          console.log("Removing track:", sender.track.kind);
          peer.removeTrack(sender);
        }
      });

      // Add new tracks
      const tracks = stream.getTracks();
      console.log("Adding", tracks.length, "tracks");
      
      tracks.forEach((track) => {
        console.log("Adding track:", track.kind, track.id);
        peer.addTrack(track, stream);
      });

      console.log("✅ Stream sent successfully");
      
    } catch (err) {
      console.error("❌ Error sending stream:", err);
      throw err;
    }
  };

  // ----------------- Get Connection Stats -----------------
  const getStats = async () => {
    if (!peer) return null;
    
    try {
      const stats = await peer.getStats();
      const result = {};
      
      stats.forEach((report) => {
        if (report.type === "candidate-pair" && report.state === "succeeded") {
          result.candidatePair = report;
        }
        if (report.type === "inbound-rtp" && report.kind === "video") {
          result.inboundVideo = report;
        }
        if (report.type === "outbound-rtp" && report.kind === "video") {
          result.outboundVideo = report;
        }
      });
      
      return result;
    } catch (err) {
      console.error("Error getting stats:", err);
      return null;
    }
  };

  // ----------------- Restart ICE -----------------
  const restartIce = async () => {
    console.log("Restarting ICE");
    
    try {
      if (!peer) return;
      
      const offer = await peer.createOffer({ iceRestart: true });
      await peer.setLocalDescription(offer);
      
      // Send new offer to remote peer
      if (socket && remoteSocketIdRef.current) {
        socket.emit("renegotiate", {
          to: remoteSocketIdRef.current,
          offer: offer
        });
      }
      
    } catch (err) {
      console.error("Error restarting ICE:", err);
    }
  };

  // ----------------- Cleanup on Unmount -----------------
  useEffect(() => {
    return () => {
      console.log("Cleaning up PeerProvider");
      
      if (peerRef.current) {
        console.log("Closing peer connection");
        peerRef.current.close();
        peerRef.current = null;
      }
      
      remoteSocketIdRef.current = null;
      
      if (socket) {
        socket.off("ice-candidate");
      }
    };
  }, [socket]);

  return (
    <peerContext.Provider
      value={{
        peer,
        createOffer,
        createAnswer,
        setRemoteAns,
        sendStream,
        getStats,
        restartIce,
        connectionState,
        iceState
      }}
    >
      {children}
    </peerContext.Provider>
  );
}

export default PeerProvider;

// ----------------- usePeer Hook -----------------
export const usePeer = () => {
  const context = useContext(peerContext);
  if (!context) {
    throw new Error("usePeer must be used within PeerProvider");
  }
  return context;
};
