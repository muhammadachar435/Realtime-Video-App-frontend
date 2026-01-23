// import { createContext, useContext, useMemo } from "react";
// import { io } from "socket.io-client";

// const SocketContext = createContext();

// const SocketProvider = ({ children }) => {
//   // Use environment variable for production
//   const backendUrl = process.env.NODE_ENV === 'production'
//     ? process.env.REACT_APP_BACKEND_URL || "https://realtime-video-app-backend-production.up.railway.app" // REPLACE
//     : "http://localhost:5001";

//   const socket = useMemo(() => io(backendUrl, {
//     transports: ['websocket', 'polling'],
//     reconnection: true,
//     reconnectionAttempts: 5,
//     reconnectionDelay: 1000,
//     timeout: 20000,
//   }), [backendUrl]);

//   return <SocketContext.Provider value={{ socket }}>{children}</SocketContext.Provider>;
// };

// export default SocketProvider;

// export const useSocket = () => useContext(SocketContext);



import { createContext, useContext, useMemo, useEffect, useState } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext();

const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Use environment variable for production
  const backendUrl = process.env.NODE_ENV === 'production'
    ? process.env.REACT_APP_BACKEND_URL || "https://realtime-video-app-backend-production.up.railway.app"
    : "http://localhost:5001";

  useEffect(() => {
    console.log("🔌 Initializing socket connection to:", backendUrl);
    
    const newSocket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
      forceNew: true, // Important for multiple tabs
      multiplex: false // Important for multiple tabs
    });

    // Connection events
    newSocket.on('connect', () => {
      console.log("✅ Socket connected with ID:", newSocket.id);
      setIsConnected(true);
    });

    newSocket.on('disconnect', (reason) => {
      console.log("❌ Socket disconnected:", reason);
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error("❌ Socket connection error:", error.message);
      setIsConnected(false);
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log(`🔄 Socket reconnected after ${attemptNumber} attempts`);
      setIsConnected(true);
    });

    newSocket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`🔄 Reconnection attempt ${attemptNumber}`);
    });

    newSocket.on('reconnect_error', (error) => {
      console.error("❌ Reconnection error:", error);
    });

    newSocket.on('reconnect_failed', () => {
      console.error("❌ Reconnection failed");
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      console.log("🧹 Cleaning up socket");
      newSocket.disconnect();
      newSocket.removeAllListeners();
    };
  }, [backendUrl]);

  const socketValue = useMemo(() => ({
    socket,
    isConnected
  }), [socket, isConnected]);

  return (
    <SocketContext.Provider value={socketValue}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketProvider;

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within SocketProvider");
  }
  return context;
};
