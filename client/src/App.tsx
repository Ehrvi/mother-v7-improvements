import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from "./pages/Home";
import DgmLineage from "./pages/DgmLineage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lineage" element={<DgmLineage />} />
        <Route path="/dgm" element={<DgmLineage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
