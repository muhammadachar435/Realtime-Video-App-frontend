import { createContext, useContext, useMemo, useEffect, useRef } from "react";
import { useSocket } from "../providers/Socket";

const peerContext = createContext(null);

function PeerProvider({ children }) {
  const { socket } = useSocket();
  const peerRef = useRef(null);
  const remoteSocketIdRef = useRef(null);

  // In PeerProvider.js, update the peer configuration:
const peer = useMemo(() => {
  const pc = new RTCPeerConnection({
    iceServers: [
      // STUN Servers
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:global.stun.twilio.com:3478",
        ],
      },
      // TURN Servers (Your ExpressTURN)
      {
        urls: "turn:free.expressturn.com:3478",
        username: "000000002084452952",
        credential: "aCNpyKTY3wZX1HLTGCh5XvUnyn4="
      },
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: "all",
    // CRITICAL: Configure audio/video codecs to prevent echo
    sdpSemantics: 'unified-plan',
  });

  // Configure audio tracks to prevent echo
  const configureAudioTrack = (track) => {
    if (track.kind === 'audio') {
      const settings = track.getSettings();
      console.log("🔊 Audio track settings:", settings);
      
      // Apply echo cancellation
      track.applyConstraints({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1, // Mono audio reduces echo
      }).catch(err => console.error("Audio constraints error:", err));
    }
  };

  // Handle when tracks are added
  pc.ontrack = (event) => {
    console.log("🎵 Remote track added:", event.track.kind);
    if (event.track.kind === 'audio') {
      configureAudioTrack(event.track);
    }
  };

  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate && socket && remoteSocketIdRef.current) {
      socket.emit("ice-candidate", {
        to: remoteSocketIdRef.current,
        candidate: event.candidate,
      });
    }
  };

  peerRef.current = pc;
  return pc;
}, [socket]);
  
  // Store remote socket ID
  const setRemoteSocketId = (socketId) => {
    remoteSocketIdRef.current = socketId;
  };

  const createOffer = async (remoteSocketId) => {
    try {
      setRemoteSocketId(remoteSocketId);
      const offer = await peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await peer.setLocalDescription(offer);
      return offer;
    } catch (error) {
      console.error("Error creating offer:", error);
      throw error;
    }
  };

  const createAnswer = async (offer) => {
    try {
      await peer.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
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

  // Cleanup
  useEffect(() => {
    return () => {
      if (peer) {
        peer.close();
      }
    };
  }, [peer]);

  return (
    <peerContext.Provider
      value={{
        peer,
        createOffer,
        createAnswer,
        setRemoteAns,
        sendStream,
        setRemoteSocketId,
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
