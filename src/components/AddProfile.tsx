import { useEffect, useState, useRef } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

interface Employee {
  emp_id: string;
  name: string;
  department: string;
}

export default function AddProfile() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchEmployees = async () => {
    const snap = await getDocs(collection(db, "employees"));
    const data = snap.docs.map((d) => d.data() as Employee);
    setEmployees(data);
  };

  const handleFileChange = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setImageBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const filteredEmployees = employees.filter(
    (emp) =>
      emp.name.toLowerCase().includes(search.toLowerCase()) ||
      emp.emp_id.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!selectedId || !imageBase64) return;

    try {
      setLoading(true);
      await updateDoc(doc(db, "employees", selectedId), {
        profile_image: imageBase64,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      setImageBase64(null);
      setSelectedId("");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const selectedEmployee = employees.find(
    (e) => e.emp_id === selectedId
  );

  return (
    <div className="min-h-screen bg-[#071536] text-white flex items-center justify-center px-4">
      <div className="w-full max-w-xl bg-[#0d2247] rounded-3xl p-8 border border-[#1e3a6e] shadow-2xl relative">

        {/* Header */}
        <h2 className="text-2xl font-bold text-[#ffd700] mb-8">
          Add Employee Profile
        </h2>

        {/* Dropdown Section */}
        <div className="relative mb-8" ref={dropdownRef}>
          <label className="block text-sm text-gray-400 mb-2">
            Select Employee
          </label>

          {/* Selected Field */}
          <div
            onClick={() => setOpen(!open)}
            className="w-full bg-[#071536] border border-[#1e3a6e] rounded-xl px-4 py-3 flex items-center justify-between cursor-pointer hover:border-[#ffd700] transition"
          >
            <span className="text-sm">
              {selectedEmployee
                ? `${selectedEmployee.emp_id} — ${selectedEmployee.name}`
                : "Choose employee"}
            </span>

            {/* Chevron */}
            <svg
              className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
              fill="none"
              stroke="#ffd700"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>

          {/* Dropdown List */}
          {open && (
            <div className="absolute left-0 right-0 mt-2 bg-[#0f2a5e] border border-[#1e3a6e] rounded-xl shadow-xl z-50">

              {/* Search */}
              <div className="p-3 border-b border-[#1e3a6e]">
                <input
                  type="text"
                  placeholder="Search employee..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-[#071536] border border-[#1e3a6e] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#ffd700]"
                />
              </div>

              {/* Scrollable List */}
              <div className="max-h-64 overflow-y-auto custom-scroll">
                {filteredEmployees.map((emp) => (
                  <div
                    key={emp.emp_id}
                    onClick={() => {
                      setSelectedId(emp.emp_id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className="px-4 py-3 hover:bg-[#1e3a6e] cursor-pointer text-sm transition"
                  >
                    <span className="text-[#ffd700] font-semibold">
                      {emp.emp_id}
                    </span>
                    <span className="text-gray-300 ml-2">
                      {emp.name}
                    </span>
                  </div>
                ))}

                {filteredEmployees.length === 0 && (
                  <div className="px-4 py-3 text-gray-500 text-sm">
                    No employees found
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Upload Section */}
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-2">
            Upload Profile Image
          </label>

          <input
            type="file"
            accept="image/*"
            onChange={(e) =>
              e.target.files && handleFileChange(e.target.files[0])
            }
            className="w-full bg-[#071536] border border-[#1e3a6e] rounded-xl px-4 py-3 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#ffd700] file:text-[#071536] file:font-semibold hover:border-[#ffd700]"
          />
        </div>

        {/* Preview */}
        {imageBase64 && (
          <div className="mb-6 flex flex-col items-center">
            <img
              src={imageBase64}
              alt="Preview"
              className="w-40 h-40 object-cover rounded-xl border-2 border-[#ffd700]"
            />
            <button
              onClick={() => setImageBase64(null)}
              className="mt-2 text-sm text-red-400 hover:text-red-300"
            >
              Remove Image
            </button>
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full py-3 rounded-xl font-semibold bg-[#ffd700] text-[#071536] hover:opacity-90 transition"
        >
          {loading ? "Saving..." : "Save Profile Image"}
        </button>

        {/* Success */}
        {success && (
          <div className="mt-4 text-green-400 text-sm text-center">
            Profile image updated successfully ✓
          </div>
        )}
      </div>

      {/* Custom Scroll Styling */}
      <style>{`
        .custom-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scroll::-webkit-scrollbar-thumb {
          background: #ffd70055;
          border-radius: 10px;
        }
        .custom-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>
    </div>
  );
}