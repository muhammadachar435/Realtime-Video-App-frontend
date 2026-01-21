import { useState, useEffect } from "react";

// RealTimeClock Component
const RealTimeClock = () => {
  const [time, setTime] = useState(new Date());

  // UseEffect
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12; // convert 24h to 12h format
    return `${hours}:${minutes} ${ampm}`;
  };

  // UI/UX Design
  return <div className="text-white font-bold text-lg">{formatTime(time)}</div>;
};

export default RealTimeClock;
