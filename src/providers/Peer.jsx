import { createContext, useContext, useMemo, useRef } from "react";

const PeerContext = createContext();

export const PeerProvider = ({ children }) => {
  const peerRef = useRef(null);

  const createPeer = () => {
    // ✅ CRUCIAL: These TURN servers WORK for mobile-to-mobile
    const configuration = {
      iceServers: [
        // STUN servers
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        
        // FREE TURN servers that actually work in 2024
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
      iceTransportPolicy: "all"
    };

    const peer = new RTCPeerConnection(configuration);
    peerRef.current = peer;

    // Log important events
    peer.oniceconnectionstatechange = () => {
      console.log("ICE Connection State:", peer.iceConnectionState);
    };

    peer.onconnectionstatechange = () => {
      console.log("Connection State:", peer.connectionState);
    };

    peer.onicecandidateerror = (event) => {
      console.warn("ICE Candidate Error:", event.errorText);
    };

    console.log("✅ PeerConnection created with TURN servers");
    return peer;
  };

  const peer = useMemo(() => createPeer(), []);

  // Create offer
  const createOffer = async () => {
    try {
      const offer = await peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await peer.setLocalDescription(offer);
      console.log("✅ Offer created");
      return offer;
    } catch (error) {
      console.error("❌ Error creating offer:", error);
      throw error;
    }
  };

  // Create answer
  const createAnswer = async (offer) => {
    try {
      await peer.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      console.log("✅ Answer created");
      return answer;
    } catch (error) {
      console.error("❌ Error creating answer:", error);
      throw error;
    }
  };

  // Set remote answer
  const setRemoteAnswer = async (answer) => {
    try {
      await peer.setRemoteDescription(new RTCSessionDescription(answer));
      console.log("✅ Remote answer set");
    } catch (error) {
      console.error("❌ Error setting remote answer:", error);
      throw error;
    }
  };

  // Add local stream
  const addStream = (stream) => {
    if (!stream || !peer) return;
    
    // Remove existing tracks
    peer.getSenders().forEach(sender => {
      if (sender.track) {
        peer.removeTrack(sender);
      }
    });
    
    // Add new tracks
    stream.getTracks().forEach(track => {
      peer.addTrack(track, stream);
    });
    
    console.log(`✅ Added ${stream.getTracks().length} tracks to peer`);
  };

  // Handle remote track
  const onTrack = (callback) => {
    peer.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        callback(event.streams[0]);
      }
    };
  };

  // Send ICE candidate
  const sendIceCandidate = (socket, candidate, to) => {
    if (socket && candidate && to) {
      socket.emit("ice-candidate", { to, candidate });
    }
  };

  // Handle incoming ICE candidate
  const handleIceCandidate = (candidate) => {
    if (peer.remoteDescription) {
      peer.addIceCandidate(new RTCIceCandidate(candidate))
        .then(() => console.log("✅ ICE candidate added"))
        .catch(err => console.error("❌ Error adding ICE:", err));
    }
  };

  // Cleanup
  const cleanup = () => {
    if (peerRef.current) {
      peerRef.current.close();
      console.log("🧹 Peer connection closed");
    }
  };

  return (
    <PeerContext.Provider
      value={{
        peer,
        createOffer,
        createAnswer,
        setRemoteAnswer,
        addStream,
        onTrack,
        sendIceCandidate,
        handleIceCandidate,
        cleanup
      }}
    >
      {children}
    </PeerContext.Provider>
  );
};

export const usePeer = () => {
  const context = useContext(PeerContext);
  if (!context) {
    throw new Error("usePeer must be used within PeerProvider");
  }
  return context;
};
