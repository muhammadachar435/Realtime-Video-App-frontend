// CallTime.jsx
import { useEffect } from "react";

const CallTime = ({ state, dispatch }) => {
  useEffect(() => {
    let intervalId;

    if (state.callStartTime) {
      intervalId = setInterval(() => {
        const now = Date.now();
        const elapsed = now - state.callStartTime;

        const hours = Math.floor(elapsed / (1000 * 60 * 60));
        const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);

        dispatch({
          type: "UPDATE_CALL_DURATION",
          payload: { hours, minutes, seconds },
        });
      }, 1000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [state.callStartTime, dispatch]);

  const formatTime = (time) => {
    if (!state.callStartTime) return "00:00";

    const { hours, minutes, seconds } = state.callDuration;

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  return <span>{formatTime()}</span>;
};

export default CallTime;
