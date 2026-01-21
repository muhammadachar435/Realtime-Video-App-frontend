/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext();

// SocketProvider Component
const SocketProvider = ({ children }) => {
  const socket = useMemo(() => 
    io("https://realtime-video-app-backend-production.up.railway.app", {
      transports: ["websocket"], // force websocket, avoid polling
      withCredentials: true,
    }),
    [] // dependencies array
  );

  return <SocketContext.Provider value={{ socket }}>{children}</SocketContext.Provider>;
};

export default SocketProvider;

// useSocket Hook
export const useSocket = () => useContext(SocketContext);
