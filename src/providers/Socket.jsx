/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext();

// SocketProvider Component
const SocketProvider = ({ children }) => {
  const socket = useMemo(() => io(`http://localhost:5001`), []);
  return <SocketContext.Provider value={{ socket }}>{children}</SocketContext.Provider>;
};

export default SocketProvider;

// useSocket Component
export const useSocket = () => useContext(SocketContext);
