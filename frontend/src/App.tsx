import { useMemo } from "react";

const App = () => {
  const message = useMemo(() => "RoboMop Frontend Initialized", []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif"
      }}
    >
      <h1>{message}</h1>
    </main>
  );
};

export default App;
