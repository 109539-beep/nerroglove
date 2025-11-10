import React, { useState, useEffect } from "react";
import * as services from "../services";
import { LogEntry } from "../services/types";

const CenterPanel: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isHistoryView, setIsHistoryView] = useState(false);
  const [historyDate, setHistoryDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  // -------------------- Load logs --------------------
  useEffect(() => {
    const loadHistory = async () => {
      if (isHistoryView) {
        const historyLogs = await services.loadLogsForDate(
          new Date(historyDate)
        );
        setLogs(historyLogs);
        if (historyLogs.length === 0) {
          appendLog("No logs found for this date.", "in");
        }
      } else {
        const todayLogs = await services.loadLogsForToday();
        setLogs(todayLogs);
      }
    };
    loadHistory();
  }, [isHistoryView, historyDate]);

  // -------------------- Append & Save --------------------
  const appendLog = (message: string, direction: "in" | "out") => {
    const newLog: LogEntry = {
      id: Date.now().toString(),
      message,
      direction,
      timestamp: new Date().toISOString(),
    };
    setLogs((prev) => [...prev, newLog]);
    services.saveLog(newLog);
  };

  // -------------------- Render --------------------
  return (
    <div className="p-4 bg-gray-900 text-white rounded-xl shadow-md">
      {/* -------- Toolbar -------- */}
      <div className="flex items-center justify-between mb-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isHistoryView}
            onChange={(e) => setIsHistoryView(e.target.checked)}
          />
          <span>View History</span>
        </label>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={historyDate}
            onChange={(e) => setHistoryDate(e.target.value)}
            disabled={!isHistoryView}
            className={`bg-gray-800 text-white px-2 py-1 rounded-md border border-gray-700 ${
              !isHistoryView ? "opacity-50 cursor-not-allowed" : ""
            }`}
          />
        </div>
      </div>

      {/* -------- Logs Display -------- */}
      <div className="h-80 overflow-y-auto bg-gray-800 rounded-lg p-3 space-y-1 text-sm">
        {logs.length === 0 ? (
          <p className="text-gray-400 text-center mt-10">No logs yet.</p>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className={`p-2 rounded ${
                log.direction === "in"
                  ? "bg-gray-700 text-green-300"
                  : "bg-gray-600 text-blue-300"
              }`}
            >
              <span className="text-xs text-gray-400">
                {new Date(log.timestamp).toLocaleTimeString()} →
              </span>{" "}
              {log.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CenterPanel;
