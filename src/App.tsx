import { BrowserRouter, Routes, Route } from "react-router-dom";
import Attendance from "./pages/Attendance";
import EmployeeDetails from "./pages/EmployeeDetails";
import AddProfile from "./components/AddProfile";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Attendance />} />
        <Route path="/:empSlug" element={<EmployeeDetails />} />
        <Route path="/profile" element={<AddProfile />} />
      </Routes>
    </BrowserRouter>
  );
}