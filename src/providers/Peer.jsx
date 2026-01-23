// // PeerProvider.js
// import { createContext, useContext, useRef, useEffect, useState } from "react";
// import { useSocket } from "../providers/Socket";

// const peerContext = createContext(null);

// function PeerProvider({ children }) {
//   const { socket } = useSocket();
//   const peerRef = useRef(null);
//   const remoteSocketIdRef = useRef(null);
//   const [peerReady, setPeerReady] = useState(false);

//   // Create peer connection only once
//   useEffect(() => {
//     if (peerRef.current) {
//       console.log("⚠️ Peer already exists, skipping creation");
//       return;
//     }

//     try {
//       console.log("🔄 Creating new RTCPeerConnection...");
      
//       const pc = new RTCPeerConnection({
//         iceServers: [
//           // STUN Servers - reduced list
//           {
//             urls: [
//               "stun:stun.l.google.com:19302",
//               "stun:global.stun.twilio.com:3478",
//             ],
//           },
//           // TURN Server (Your ExpressTURN)
//           {
//             urls: "turn:free.expressturn.com:3478",
//             username: "000000002084452952",
//             credential: "aCNpyKTY3wZX1HLTGCh5XvUnyn4=",
//           },
//         ],
//         iceCandidatePoolSize: 5, // Reduced from 10
//         iceTransportPolicy: "all",
//       });

//       // Handle ICE candidates
//       pc.onicecandidate = (event) => {
//         if (event.candidate && socket && remoteSocketIdRef.current) {
//           socket.emit("ice-candidate", {
//             to: remoteSocketIdRef.current,
//             candidate: event.candidate,
//           });
//         }
//       };

//       // Handle ICE connection state
//       pc.oniceconnectionstatechange = () => {
//         console.log("ICE Connection State:", pc.iceConnectionState);
//         if (pc.iceConnectionState === "failed") {
//           console.log("ICE failed, restarting ICE...");
//           setTimeout(() => {
//             try {
//               pc.restartIce();
//             } catch (err) {
//               console.error("Failed to restart ICE:", err);
//             }
//           }, 1000);
//         }
//       };

//       // Handle connection state
//       pc.onconnectionstatechange = () => {
//         console.log("Peer Connection State:", pc.connectionState);
//       };

//       peerRef.current = pc;
//       setPeerReady(true);
//       console.log("✅ RTCPeerConnection created successfully");

//     } catch (error) {
//       console.error("❌ Failed to create RTCPeerConnection:", error);
//       // Try with simpler configuration
//       try {
//         console.log("🔄 Trying simpler configuration...");
//         const simplePc = new RTCPeerConnection({
//           iceServers: [
//             {
//               urls: "stun:stun.l.google.com:19302"
//             }
//           ]
//         });
//         peerRef.current = simplePc;
//         setPeerReady(true);
//         console.log("✅ RTCPeerConnection created with simple config");
//       } catch (simpleError) {
//         console.error("❌ Failed with simple config too:", simpleError);
//       }
//     }

//     // Cleanup on unmount
//     return () => {
//       if (peerRef.current) {
//         console.log("🧹 Cleaning up RTCPeerConnection...");
//         try {
//           peerRef.current.close();
//         } catch (err) {
//           console.error("Error closing peer:", err);
//         }
//         peerRef.current = null;
//         setPeerReady(false);
//       }
//     };
//   }, [socket]);

//   // Store remote socket ID
//   const setRemoteSocketId = (socketId) => {
//     remoteSocketIdRef.current = socketId;
//   };

//   const createOffer = async (remoteSocketId) => {
//     if (!peerRef.current) {
//       throw new Error("Peer connection not ready");
//     }

//     try {
//       setRemoteSocketId(remoteSocketId);
//       const offer = await peerRef.current.createOffer({
//         offerToReceiveAudio: true,
//         offerToReceiveVideo: true,
//       });
//       await peerRef.current.setLocalDescription(offer);
//       return offer;
//     } catch (error) {
//       console.error("Error creating offer:", error);
//       throw error;
//     }
//   };

//   const createAnswer = async (offer) => {
//     if (!peerRef.current) {
//       throw new Error("Peer connection not ready");
//     }

//     try {
//       await peerRef.current.setRemoteDescription(new RTCSessionDescription(offer));
//       const answer = await peerRef.current.createAnswer();
//       await peerRef.current.setLocalDescription(answer);
//       return answer;
//     } catch (error) {
//       console.error("Error creating answer:", error);
//       throw error;
//     }
//   };

//   const setRemoteAns = async (ans) => {
//     if (!peerRef.current) {
//       throw new Error("Peer connection not ready");
//     }

//     try {
//       await peerRef.current.setRemoteDescription(new RTCSessionDescription(ans));
//     } catch (error) {
//       console.error("Error setting remote answer:", error);
//       throw error;
//     }
//   };

//   const sendStream = async (stream) => {
//     if (!peerRef.current) {
//       throw new Error("Peer connection not ready");
//     }

//     try {
//       const currentSenders = peerRef.current.getSenders();
      
//       stream.getTracks().forEach((track) => {
//         // Check if track already exists
//         const existingSender = currentSenders.find(
//           sender => sender.track && sender.track.kind === track.kind
//         );
        
//         if (existingSender) {
//           // Replace track in existing sender
//           existingSender.replaceTrack(track);
//           console.log(`🔄 Replaced ${track.kind} track`);
//         } else {
//           // Add new track
//           peerRef.current.addTrack(track, stream);
//           console.log(`➕ Added new ${track.kind} track`);
//         }
//       });

//       console.log("✅ Stream synchronized with peer connection");
//     } catch (error) {
//       console.error("Error sending stream:", error);
//       throw error;
//     }
//   };

//   // Provide peer object only when ready
//   const value = {
//     peer: peerRef.current,
//     createOffer,
//     createAnswer,
//     setRemoteAns,
//     sendStream,
//     setRemoteSocketId,
//     peerReady,
//   };

//   return (
//     <peerContext.Provider value={value}>
//       {children}
//     </peerContext.Provider>
//   );
// }

// export default PeerProvider;

// export const usePeer = () => {
//   const context = useContext(peerContext);
//   if (!context) {
//     throw new Error("usePeer must be used within PeerProvider");
//   }
//   return context;
// };



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

  // Create peer connection
  const createPeerConnection = useCallback(() => {
    // Clean up existing connection first
    if (peerRef.current) {
      console.log("🧹 Cleaning up existing peer connection...");
      try {
        peerRef.current.close();
      } catch (err) {
        console.error("Error closing existing peer:", err);
      }
      peerRef.current = null;
      setPeerReady(false);
      isConnectionClosed.current = false;
    }

    try {
      console.log("🔄 Creating new RTCPeerConnection...");
      
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
          // TURN Server (Your ExpressTURN)
          {
            urls: "turn:free.expressturn.com:3478",
            username: "000000002084452952",
            credential: "aCNpyKTY3wZX1HLTGCh5XvUnyn4=",
          },
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: "all",
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
      });

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socket && remoteSocketIdRef.current && !isConnectionClosed.current) {
          console.log("📤 Sending ICE candidate to:", remoteSocketIdRef.current);
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
        if (pc.iceConnectionState === "failed") {
          console.log("❌ ICE failed, restarting ICE...");
          try {
            pc.restartIce();
          } catch (err) {
            console.error("Failed to restart ICE:", err);
          }
        } else if (pc.iceConnectionState === "disconnected") {
          console.log("⚠️ ICE disconnected, trying to reconnect...");
        } else if (pc.iceConnectionState === "closed") {
          isConnectionClosed.current = true;
          console.log("🚫 ICE connection closed");
        }
      };

      // Handle connection state
      pc.onconnectionstatechange = () => {
        console.log("🔗 Peer Connection State:", pc.connectionState);
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          console.log("🔄 Attempting to reconnect...");
        } else if (pc.connectionState === "closed") {
          isConnectionClosed.current = true;
          console.log("🚫 Peer connection closed");
        }
      };

      // Handle signaling state
      pc.onsignalingstatechange = () => {
        console.log("📶 Signaling State:", pc.signalingState);
      };

      // Handle negotiation needed
      pc.onnegotiationneeded = async () => {
        console.log("🔄 Negotiation needed");
        try {
          if (remoteSocketIdRef.current && socket && !isConnectionClosed.current) {
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true,
              iceRestart: true,
            });
            await pc.setLocalDescription(offer);
            
            socket.emit("renegotiate", {
              to: remoteSocketIdRef.current,
              offer: offer,
            });
            console.log("📨 Renegotiation offer sent");
          }
        } catch (err) {
          console.error("❌ Error during renegotiation:", err);
        }
      };

      peerRef.current = pc;
      setPeerReady(true);
      isConnectionClosed.current = false;
      console.log("✅ RTCPeerConnection created successfully");

      return pc;
    } catch (error) {
      console.error("❌ Failed to create RTCPeerConnection:", error);
      return null;
    }
  }, [socket]);

  // Initialize peer connection
  useEffect(() => {
    createPeerConnection();

    // Cleanup on unmount
    return () => {
      if (peerRef.current) {
        console.log("🧹 Cleaning up RTCPeerConnection on unmount...");
        try {
          isConnectionClosed.current = true;
          peerRef.current.close();
        } catch (err) {
          console.error("Error closing peer:", err);
        }
        peerRef.current = null;
        setPeerReady(false);
      }
    };
  }, [createPeerConnection]);

  // Listen for renegotiation events
  useEffect(() => {
    if (!socket) return;

    const handleRenegotiate = async ({ from, offer }) => {
      if (!peerRef.current || isConnectionClosed.current) {
        console.log("⚠️ Peer closed, cannot renegotiate");
        return;
      }

      try {
        console.log("📥 Received renegotiation offer from:", from);
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerRef.current.createAnswer();
        await peerRef.current.setLocalDescription(answer);
        
        socket.emit("renegotiate-answer", {
          to: from,
          answer: answer,
        });
        console.log("📨 Renegotiation answer sent");
      } catch (err) {
        console.error("❌ Error handling renegotiation:", err);
      }
    };

    const handleRenegotiateAnswer = async ({ ans }) => {
      if (!peerRef.current || isConnectionClosed.current) {
        console.log("⚠️ Peer closed, cannot set renegotiation answer");
        return;
      }

      try {
        console.log("📥 Received renegotiation answer");
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(ans));
        console.log("✅ Renegotiation completed");
      } catch (err) {
        console.error("❌ Error setting renegotiation answer:", err);
      }
    };

    socket.on("renegotiate", handleRenegotiate);
    socket.on("renegotiate-answer", handleRenegotiateAnswer);

    return () => {
      socket.off("renegotiate", handleRenegotiate);
      socket.off("renegotiate-answer", handleRenegotiateAnswer);
    };
  }, [socket]);

  // Store remote socket ID
  const setRemoteSocketId = useCallback((socketId) => {
    remoteSocketIdRef.current = socketId;
    console.log("📝 Remote socket ID set:", socketId);
  }, []);

  const createOffer = useCallback(async () => {
    if (!peerRef.current || isConnectionClosed.current) {
      console.log("⚠️ Peer connection not ready or closed, creating new one...");
      createPeerConnection();
    }

    if (!peerRef.current) {
      throw new Error("Peer connection not ready");
    }

    try {
      console.log("📞 Creating offer...");
      const offer = await peerRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await peerRef.current.setLocalDescription(offer);
      console.log("✅ Offer created and set as local description");
      return offer;
    } catch (error) {
      console.error("❌ Error creating offer:", error);
      
      // Try to recreate connection and retry
      if (error.message.includes("closed") || isConnectionClosed.current) {
        console.log("🔄 Peer was closed, recreating...");
        createPeerConnection();
        // Wait a bit for connection to establish
        await new Promise(resolve => setTimeout(resolve, 100));
        return createOffer();
      }
      
      throw error;
    }
  }, [createPeerConnection]);

  const createAnswer = useCallback(async (offer) => {
    if (!peerRef.current || isConnectionClosed.current) {
      console.log("⚠️ Peer connection not ready or closed, creating new one...");
      createPeerConnection();
    }

    if (!peerRef.current) {
      throw new Error("Peer connection not ready");
    }

    try {
      console.log("📝 Creating answer...");
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerRef.current.createAnswer();
      await peerRef.current.setLocalDescription(answer);
      console.log("✅ Answer created and set as local description");
      return answer;
    } catch (error) {
      console.error("❌ Error creating answer:", error);
      
      // Try to recreate connection and retry
      if (error.message.includes("closed") || isConnectionClosed.current) {
        console.log("🔄 Peer was closed, recreating...");
        createPeerConnection();
        // Wait a bit for connection to establish
        await new Promise(resolve => setTimeout(resolve, 100));
        return createAnswer(offer);
      }
      
      throw error;
    }
  }, [createPeerConnection]);

  const setRemoteAns = useCallback(async (ans) => {
    if (!peerRef.current || isConnectionClosed.current) {
      console.log("⚠️ Peer connection not ready or closed");
      throw new Error("Peer connection not ready");
    }

    try {
      console.log("✅ Setting remote answer...");
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(ans));
      console.log("✅ Remote answer set successfully");
      
      // If we have a local stream, send it after setting remote description
      if (localStreamRef.current) {
        console.log("🔄 Sending local stream after remote answer...");
        await sendStream(localStreamRef.current);
      }
    } catch (error) {
      console.error("❌ Error setting remote answer:", error);
      throw error;
    }
  }, []);

  const sendStream = useCallback(async (stream) => {
    // Store stream reference
    localStreamRef.current = stream;
    
    if (!peerRef.current) {
      console.log("⚠️ Peer connection not created yet, storing stream for later");
      return;
    }

    if (isConnectionClosed.current) {
      console.log("⚠️ Peer connection is closed, cannot send stream");
      throw new Error("Peer connection is closed");
    }

    try {
      console.log("📤 Sending stream to peer connection...");
      const currentSenders = peerRef.current.getSenders();
      
      // Remove existing tracks first
      currentSenders.forEach(sender => {
        if (sender.track) {
          peerRef.current.removeTrack(sender);
          console.log(`🧹 Removed existing ${sender.track.kind} track`);
        }
      });

      // Add new tracks
      stream.getTracks().forEach((track) => {
        try {
          peerRef.current.addTrack(track, stream);
          console.log(`➕ Added ${track.kind} track`);
        } catch (err) {
          console.error(`❌ Failed to add ${track.kind} track:`, err);
        }
      });

      console.log("✅ Stream sent to peer connection successfully");
    } catch (error) {
      console.error("❌ Error sending stream:", error);
      throw error;
    }
  }, []);

  // Reset peer connection (for reconnection scenarios)
  const resetPeerConnection = useCallback(() => {
    console.log("🔄 Resetting peer connection...");
    createPeerConnection();
  }, [createPeerConnection]);

  // Provide peer object only when ready
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
