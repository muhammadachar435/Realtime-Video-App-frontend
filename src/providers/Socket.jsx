/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useEffect, useState } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext();

// SocketProvider Component
const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);

  // Create socket connection
  const socketInstance = useMemo(() => {
    // Use your Railway URL
    const socketUrl = "https://realtime-video-app-backend-production.up.railway.app";
    
    console.log("🔗 Connecting to backend:", socketUrl);
    
    return io(socketUrl, {
      transports: ["websocket", "polling"], // Allow both for reliability
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 20000,
      forceNew: true,
      withCredentials: true,
    });
  }, []);

  // Setup socket events
  useEffect(() => {
    if (!socketInstance) return;

    const handleConnect = () => {
      console.log("✅ Socket connected successfully! ID:", socketInstance.id);
      setSocket(socketInstance);
    };

    const handleDisconnect = (reason) => {
      console.log("❌ Socket disconnected:", reason);
      if (reason === "io server disconnect") {
        // Server disconnected, try to reconnect
        socketInstance.connect();
      }
    };

    const handleError = (error) => {
      console.error("❌ Socket error:", error);
    };

    // Attach event listeners
    socketInstance.on("connect", handleConnect);
    socketInstance.on("disconnect", handleDisconnect);
    socketInstance.on("error", handleError);
    socketInstance.on("connect_error", (error) => {
      console.error("❌ Connection error:", error.message);
    });

    // Set socket in state
    setSocket(socketInstance);

    // Cleanup
    return () => {
      console.log("🧹 Cleaning up socket connection");
      socketInstance.off("connect", handleConnect);
      socketInstance.off("disconnect", handleDisconnect);
      socketInstance.off("error", handleError);
      socketInstance.disconnect();
    };
  }, [socketInstance]);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketProvider;

// useSocket Hook
export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within SocketProvider");
  }
  return context;
};
