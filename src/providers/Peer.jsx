import { createContext, useContext, useMemo, useEffect, useRef, useState } from "react";
import { useSocket } from "../providers/Socket";

const peerContext = createContext(null);

function PeerProvider({ children }) {
  const { socket } = useSocket();
  const peerRef = useRef(null);
  const remoteSocketIdRef = useRef(null);
  const [isNegotiating, setIsNegotiating] = useState(false);

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
          credential: "aCNpyKTY3wZX1HLTGCh5XvUnyn4=",
        },
      ],
      iceCandidatePoolSize: 5,
      iceTransportPolicy: "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
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
      if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
        console.log("ICE failed/disconnected, restarting ICE...");
        pc.restartIce();
      }
    };

    // Handle negotiation needed
    pc.onnegotiationneeded = async () => {
      if (isNegotiating) return;
      setIsNegotiating(true);
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);
        
        if (socket && remoteSocketIdRef.current) {
          socket.emit("renegotiate", {
            to: remoteSocketIdRef.current,
            offer: offer,
          });
        }
      } catch (err) {
        console.error("Negotiation error:", err);
      } finally {
        setIsNegotiating(false);
      }
    };

    // Handle track events
    pc.ontrack = (event) => {
      console.log("Track received:", event.streams.length, "stream(s)");
    };

    peerRef.current = pc;
    return pc;
  }, [socket, isNegotiating]);

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
        iceRestart: true
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
      // First, remove only existing tracks of the same type
      const existingSenders = peer.getSenders();
      
      // Get track types from new stream
      const newVideoTrack = stream.getVideoTracks()[0];
      const newAudioTrack = stream.getAudioTracks()[0];
      
      // Replace existing tracks with new ones
      existingSenders.forEach((sender) => {
        if (sender.track) {
          if (sender.track.kind === 'video' && newVideoTrack) {
            sender.replaceTrack(newVideoTrack);
          } else if (sender.track.kind === 'audio' && newAudioTrack) {
            sender.replaceTrack(newAudioTrack);
          }
        }
      });

      // Add new tracks if no existing sender
      if (newVideoTrack && !existingSenders.find(s => s.track?.kind === 'video')) {
        peer.addTrack(newVideoTrack, stream);
      }
      
      if (newAudioTrack && !existingSenders.find(s => s.track?.kind === 'audio')) {
        peer.addTrack(newAudioTrack, stream);
      }

      console.log("✅ Stream tracks updated in peer connection");
    } catch (error) {
      console.error("Error sending stream:", error);
      throw error;
    }
  };

  const cleanup = () => {
    if (peerRef.current) {
      peerRef.current.getSenders().forEach(sender => {
        if (sender.track) {
          sender.track.stop();
        }
      });
      peerRef.current.close();
    }
  };

  // Cleanup
  useEffect(() => {
    return cleanup;
  }, []);

  return (
    <peerContext.Provider
      value={{
        peer,
        createOffer,
        createAnswer,
        setRemoteAns,
        sendStream,
        setRemoteSocketId,
        cleanup
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
