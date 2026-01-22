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
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:global.stun.twilio.com:3478",
        ],
      },
      {
        urls: "turn:free.expressturn.com:3478",
        username: "000000002084452952",
        credential: "aCNpyKTY3wZX1HLTGCh5XvUnyn4="
      },
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: "all",
    // Audio echo cancellation ke liye zaroori settings
    sdpSemantics: 'unified-plan',
    // Audio processing ke liye experimental settings
    forceEncodedAudioInsertableStreams: true,
  });

  // **IMPORTANT: Audio constraints ko enforce karein**
  const configureAudioTrack = (track) => {
    if (track.kind === 'audio') {
      // Detailed audio constraints
      const constraints = {
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        autoGainControl: { ideal: true },
        // Echo cancellation level
        echoCancellationType: 'system',
        // Mono audio reduces echo significantly
        channelCount: 1,
        // Sample rate
        sampleRate: 16000,
        // Latency optimization
        latency: 0.01,
        // Noise suppression level
        noiseSuppressionLevel: 'high',
        // Volume normalization
        autoGainControlLevel: 'adaptive'
      };

      track.applyConstraints(constraints).catch(err => {
        console.warn("Audio constraints could not be applied:", err);
      });

      // Audio context create karein for better processing
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000,
          latencyHint: 'interactive'
        });
        
        const source = audioContext.createMediaStreamSource(new MediaStream([track]));
        const destination = audioContext.createMediaStreamDestination();
        
        // Noise gate filter
        const noiseGate = audioContext.createGain();
        noiseGate.gain.value = 0.1;
        noiseGate.gain.setValueAtTime(0.1, audioContext.currentTime);
        
        source.connect(noiseGate);
        noiseGate.connect(destination);
        
        // Update track with processed audio
        const processedTrack = destination.stream.getAudioTracks()[0];
        return processedTrack;
      } catch (e) {
        console.log("Web Audio API not available, using default track");
        return track;
      }
    }
    return track;
  };

  // Handle track events
  pc.ontrack = (event) => {
    console.log("🎵 Remote track received:", event.track.kind);
    
    if (event.track.kind === 'audio') {
      // Remote audio ko process karein
      const processedTrack = configureAudioTrack(event.track);
      
      // Replace original track with processed one
      const stream = new MediaStream([processedTrack]);
      
      // Dispatch event for RoomPage to handle
      const customEvent = new CustomEvent('processed-track', {
        detail: { stream, track: processedTrack }
      });
      window.dispatchEvent(customEvent);
    }
  };

  // Track local audio to prevent echo
  pc.onnegotiationneeded = async () => {
    const senders = pc.getSenders();
    senders.forEach(sender => {
      if (sender.track && sender.track.kind === 'audio') {
        configureAudioTrack(sender.track);
      }
    });
  };

  // Enhanced ICE handling
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
