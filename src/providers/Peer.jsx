/* eslint-disable react-hooks/refs */
import { createContext, useContext, useMemo, useEffect, useRef, useState } from "react";
import { useSocket } from "../providers/Socket";

// Create context
const peerContext = createContext(null);

// PeerProvider Component
function PeerProvider({ children }) {
  const { socket } = useSocket();
  const peerRef = useRef(null);
  const pendingCandidates = useRef([]);
  const [localStream, setLocalStream] = useState(null);

  // Create RTCPeerConnection
  const peer = useMemo(() => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: ["stun:stun.l.google.com:19302"] },
        { urls: ["stun:global.stun.twilio.com:3478"] },
        // Optional TURN server for mobile NAT/firewall
        // { urls: "turn:your-turn-server.com:3478", username: "user", credential: "pass" },
      ],
    });

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit("ice-candidate", {
          candidate: event.candidate,
          // remoteSocketId must be set when calling
        });
      }
    };

    // Handle remote tracks
    pc.ontrack = (event) => {
      console.log("Received remote track:", event.streams[0]);
      // You can set remote stream to state here
    };

    peerRef.current = pc;
    return pc;
  }, [socket]);

  // Handle incoming ICE candidates
  useEffect(() => {
    if (!socket) return;

    const handleCandidate = ({ candidate }) => {
      if (!candidate) return;
      if (peer.remoteDescription) {
        peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
      } else {
        pendingCandidates.current.push(candidate);
      }
    };

    socket.on("ice-candidate", handleCandidate);

    return () => {
      socket.off("ice-candidate", handleCandidate);
    };
  }, [socket, peer]);

  // Create Offer
  const createOffer = async (remoteSocketId) => {
    try {
      const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await peer.setLocalDescription(offer);
      return offer;
    } catch (error) {
      console.error("Error creating offer:", error);
      throw error;
    }
  };

  // Create Answer
  const createAnswer = async (offer) => {
    try {
      await peer.setRemoteDescription(offer);
      // Apply pending candidates
      pendingCandidates.current.forEach(c => peer.addIceCandidate(new RTCIceCandidate(c)).catch(console.error));
      pendingCandidates.current = [];

      const answer = await peer.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await peer.setLocalDescription(answer);
      return answer;
    } catch (error) {
      console.error("Error creating answer:", error);
      throw error;
    }
  };

  // Set Remote Answer
  const setRemoteAns = async (answer) => {
    try {
      await peer.setRemoteDescription(answer);
      // Apply pending candidates
      pendingCandidates.current.forEach(c => peer.addIceCandidate(new RTCIceCandidate(c)).catch(console.error));
      pendingCandidates.current = [];
    } catch (error) {
      console.error("Error setting remote answer:", error);
      throw error;
    }
  };

  // Send local stream
  const sendStream = async (stream) => {
    try {
      setLocalStream(stream);
      const senders = peer.getSenders();
      // Remove previous tracks
      senders.forEach(sender => {
        if (sender.track) peer.removeTrack(sender);
      });
      // Add new tracks
      stream.getTracks().forEach(track => peer.addTrack(track, stream));
      console.log("✅ Local stream added to peer connection");
    } catch (error) {
      console.error("Error sending stream:", error);
      throw error;
    }
  };

  // Toggle microphone
  const toggleMic = (enabled) => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) audioTrack.enabled = enabled;
  };

  // Toggle camera
  const toggleCamera = (enabled) => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) videoTrack.enabled = enabled;
  };

  return (
    <peerContext.Provider
      value={{
        peer,
        createOffer,
        createAnswer,
        setRemoteAns,
        sendStream,
        toggleMic,
        toggleCamera,
      }}
    >
      {children}
    </peerContext.Provider>
  );
}

export default PeerProvider;

// usePeer Hook
export const usePeer = () => {
  const context = useContext(peerContext);
  if (!context) throw new Error("usePeer must be used within PeerProvider");
  return context;
};

