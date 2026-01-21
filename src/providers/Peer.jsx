/* eslint-disable react-hooks/refs */
import { createContext, useContext, useMemo, useEffect, useRef } from "react";
import { useSocket } from "../providers/Socket";

// CreateContext
const peerContext = createContext(null);

// PeerProvide Component
function PeerProvider({ children }) {
  const { socket } = useSocket();
  const peerRef = useRef(null);
  const remoteSocketIdRef = useRef(null);

  const peer = useMemo(() => {
    const pc = new RTCPeerConnection({
      iceServers: [
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
      ],
    });

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && remoteSocketIdRef.current) {
        console.log("Sending ICE candidate:", event.candidate);
        socket.emit("ice-candidate", {
          to: remoteSocketIdRef.current, // You need to track the remote socket ID
          candidate: event.candidate,
        });
      }
    };

    
    // Handle ICE candidate from remote


    
    if (socket) {
    const pendingCandidates = [];
  socket.on("ice-candidate", ({ candidate }) => {
  if (!candidate) return;
  if (peer.remoteDescription) {
    peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
  } else {
    pendingCandidates.push(candidate);
  }
});

// After setting remote description:
await peer.setRemoteDescription(new RTCSessionDescription(ans));
pendingCandidates.forEach(c => peer.addIceCandidate(new RTCIceCandidate(c)));
pendingCandidates.length = 0;

    }

    peerRef.current = pc;
    return pc;
  }, [socket]);

  const createOffer = async (remoteSocketIdRef) => {
    try {
      const offer = await peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await peer.setLocalDescription(new RTCSessionDescription(offer));
      return offer;
    } catch (error) {
      console.error("Error creating offer:", error);
      throw error;
    }
  };

  const createAnswer = async (offer) => {
    try {
      await peer.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await peer.setLocalDescription(new RTCSessionDescription(answer));
      return answer;
    } catch (error) {
      console.error("Error creating answer:", error);
      throw error;
    }
  };

  const setRemoteAns = async (ans) => {
    try {
      await peer.setRemoteDescription(new RTCSessionDescription(ans));
    } catch (error) {
      console.error("Error setting remote answer:", error);
      throw error;
    }
  };

  const sendStream = async (stream) => {
    try {
      // Clear existing senders
      const senders = peer.getSenders();
      senders.forEach((sender) => {
        if (sender.track) {
          peer.removeTrack(sender);
        }
      });

      // Add new tracks
      stream.getTracks().forEach((track) => {
        peer.addTrack(track, stream);
      });

      console.log("✅ Stream tracks added to peer connection");
    } catch (error) {
      console.error("Error sending stream:", error);
      throw error;
    }
  };

  // Cleanup socket listeners
  useEffect(() => {
    return () => {
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
      }}
    >
      {children}
    </peerContext.Provider>
  );
}

export default PeerProvider;

// usePeer Component
export const usePeer = () => {
  const context = useContext(peerContext);
  if (!context) {
    throw new Error("usePeer must be used within PeerProvider");
  }
  return context;
};
