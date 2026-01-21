/* eslint-disable react-hooks/exhaustive-deps */
import { createContext, useContext, useMemo, useEffect, useRef } from "react";
import { useSocket } from "../providers/Socket";

// Create Context
const peerContext = createContext(null);

// PeerProvider Component
function PeerProvider({ children }) {
  const { socket } = useSocket();
  const peerRef = useRef(null);
  const remoteSocketIdRef = useRef(null); // Will store the remote user's socket ID

  // Initialize PeerConnection
  const peer = useMemo(() => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: ["stun:stun.l.google.com:19302"] },
        { urls: ["stun:global.stun.twilio.com:3478"] },
      ],
    });

    // ----------------- ICE Candidate Handling -----------------
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && remoteSocketIdRef.current) {
        socket.emit("ice-candidate", {
          to: remoteSocketIdRef.current,
          candidate: event.candidate,
        });
      }
    };

    return pc;
  }, [socket]);

  // ----------------- Remote ICE Candidate Listener -----------------
  useEffect(() => {
    if (!socket) return;

    const handleRemoteIce = ({ candidate, from }) => {
      if (candidate && peer && peer.remoteDescription) {
        peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
      }
      // Track remote socket ID for future ICE candidates
      if (from) remoteSocketIdRef.current = from;
    };

    socket.on("ice-candidate", handleRemoteIce);
    return () => socket.off("ice-candidate", handleRemoteIce);
  }, [socket, peer]);

  // ----------------- Create Offer -----------------
  const createOffer = async (remoteSocketId) => {
    try {
      remoteSocketIdRef.current = remoteSocketId; // Save remote socket ID
      const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await peer.setLocalDescription(offer);
      return offer;
    } catch (err) {
      console.error("Error creating offer:", err);
      throw err;
    }
  };

  // ----------------- Create Answer -----------------
  const createAnswer = async (offer, remoteSocketId) => {
    try {
      remoteSocketIdRef.current = remoteSocketId; // Save remote socket ID
      await peer.setRemoteDescription(offer);
      const answer = await peer.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await peer.setLocalDescription(answer);
      return answer;
    } catch (err) {
      console.error("Error creating answer:", err);
      throw err;
    }
  };

  // ----------------- Set Remote Answer -----------------
  const setRemoteAns = async (answer) => {
    try {
      await peer.setRemoteDescription(answer);
    } catch (err) {
      console.error("Error setting remote answer:", err);
      throw err;
    }
  };

  // ----------------- Send Media Stream -----------------
  const sendStream = async (stream) => {
    try {
      // Remove previous tracks
      peer.getSenders().forEach((sender) => {
        if (sender.track) peer.removeTrack(sender);
      });

      // Add new tracks
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    } catch (err) {
      console.error("Error sending stream:", err);
      throw err;
    }
  };

  // ----------------- Cleanup on Unmount -----------------
  useEffect(() => {
    return () => {
      if (peer) peer.close();
      if (socket) socket.off("ice-candidate");
    };
  }, [peer, socket]);

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

// ----------------- usePeer Hook -----------------
export const usePeer = () => {
  const context = useContext(peerContext);
  if (!context) {
    throw new Error("usePeer must be used within PeerProvider");
  }
  return context;
};
