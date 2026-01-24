const boxes = Array.from({ length: 26 }).map(() => ({
  top: `${Math.random() * 100}%`,
  left: `${Math.random() * 100}%`,
  size: 40 + Math.random() * 60,
  duration: 6 + Math.random() * 14,
}));

export default function FloatingBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {boxes.map((box, i) => (
        <div
          key={i}
          className="floating-box"
          style={{
            top: box.top,
            left: box.left,
            width: box.size,
            height: box.size,
            animationDuration: `${box.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
