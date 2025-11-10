import React, { useState, useEffect } from "react";
import { DoctorInfo, UIStrings } from "../services";
import * as services from "../services";

interface CenterPanelProps {
  doctor: DoctorInfo;
  uiStrings: UIStrings;
}

const CenterPanel: React.FC<CenterPanelProps> = ({ doctor, uiStrings }) => {
  const [connection, setConnection] = useState<BluetoothDevice | SerialPort | null>(null);
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; type: "in" | "out" }[]>([]);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [input, setInput] = useState("");

  // --------- Append logs ----------
  const appendLog = (msg: string, type: "in" | "out") => {
    setLogs((prev) => [...prev, { msg, type }]);
  };

  // --------- Serial & Bluetooth ----------
  const connectBluetooth = async () => {
    try {
      appendLog("🔗 Requesting Bluetooth device...", "out");
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ["battery_service"],
      });
      setConnection(device);
      setConnected(true);
      appendLog(`✅ Connected to ${device.name || "Unknown Device"}`, "in");
    } catch (error) {
      appendLog(`❌ Bluetooth connection failed: ${String(error)}`, "in");
    }
  };

  const connectSerial = async () => {
    try {
      appendLog("🔗 Requesting Serial Port...", "out");
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      setConnection(port);
      setConnected(true);
      appendLog("✅ Serial port connected successfully!", "in");
    } catch (error) {
      appendLog(`❌ Serial connection failed: ${String(error)}`, "in");
    }
  };

  const disconnect = async () => {
    try {
      if (connection instanceof BluetoothDevice) {
        await connection.gatt?.disconnect();
      } else if (connection && "close" in connection) {
        await (connection as SerialPort).close();
      }
      setConnected(false);
      appendLog("🔌 Disconnected successfully.", "in");
    } catch (error) {
      appendLog(`⚠️ Disconnect failed: ${String(error)}`, "in");
    }
  };

  const handleSend = async () => {
    if (!connection) {
      appendLog("⚠️ No connection established.", "in");
      return;
    }
    appendLog(`➡️ ${input}`, "out");
    setInput("");
  };

  // --------- Search Nearby Hospitals ----------
  const handleSearchHospitals = () => {
    if (!navigator.geolocation) {
      appendLog("❌ Geolocation is not supported by your browser.", "in");
      return;
    }

    appendLog("📍 Requesting location access to find nearby hospitals...", "out");

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          appendLog(`✅ Location detected: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, "in");

          // Open Google Maps centered at user’s location
          const mapsUrl = `https://www.google.com/maps/search/hospitals/@${latitude},${longitude},15z`;
          window.open(mapsUrl, "_blank");
        },
        (error) => {
          let message = "";
          switch (error.code) {
            case error.PERMISSION_DENIED:
              message = "❌ Location access denied by user.";
              break;
            case error.POSITION_UNAVAILABLE:
              message = "⚠️ Location information unavailable.";
              break;
            case error.TIMEOUT:
              message = "⏱️ Location request timed out.";
              break;
            default:
              message = "❗ Unknown geolocation error.";
          }
          appendLog(message, "in");
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } catch (err) {
      appendLog(`❌ Geolocation failed: ${err instanceof Error ? err.message : String(err)}`, "in");
    }
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-900 to-slate-800 p-6 rounded-2xl text-white shadow-xl border border-white/10">
      <header className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-bold">{doctor.name}</h2>
          <p className="text-sm text-white/70">{doctor.phone}</p>
        </div>
        <div className="flex gap-2">
          {!connected ? (
            <>
              <button
                onClick={connectBluetooth}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition"
              >
                {uiStrings.connectBluetooth}
              </button>
              <button
                onClick={connectSerial}
                className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg font-semibold transition"
              >
                {uiStrings.connectSerial}
              </button>
            </>
          ) : (
            <button
              onClick={disconnect}
              className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg font-semibold transition"
            >
              {uiStrings.disconnect}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto bg-black/20 rounded-xl p-4 border border-white/10">
        {logs.map((log, idx) => (
          <div
            key={idx}
            className={`my-1 text-sm ${
              log.type === "in" ? "text-green-400" : "text-blue-400"
            }`}
          >
            {log.msg}
          </div>
        ))}
      </main>

      <div className="mt-4 flex gap-3 items-center">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={uiStrings.enterMessage}
          className="flex-1 p-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40"
        />
        <button
          onClick={handleSend}
          className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-semibold transition"
        >
          {uiStrings.send}
        </button>
        <button
          onClick={handleSearchHospitals}
          className="bg-rose-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-rose-700 transition"
        >
          🏥 {uiStrings.searchHospitals || "Search nearby hospitals"}
        </button>
        <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={autoTranslate}
            onChange={(e) => setAutoTranslate(e.target.checked)}
            className="form-checkbox bg-white/20 border-white/30 rounded text-teal-400 focus:ring-teal-300"
          />
          {uiStrings.autoTranslate}
        </label>
      </div>

      <footer className="mt-3 text-xs text-white/70 flex justify-between">
        <div>Run on HTTPS / localhost for Bluetooth, Serial, Geolocation</div>
        <div>Supports BLE (HM-10) & Web Serial.</div>
      </footer>
    </div>
  );
};

export default CenterPanel;
