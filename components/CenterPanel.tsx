import React, { useState, useEffect, useRef } from 'react';
import { LogEntry, ConnectionType, UIStrings } from '../services';
import * as services from '../services';

// --- LogLine Component ---
const LogLine: React.FC<{ log: LogEntry; language: string; autoTranslate: boolean }> = ({ log, language, autoTranslate }) => {
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  useEffect(() => {
    if (!autoTranslate || log.direction === 'out' || language === 'en') {
      setTranslatedText(null);
      return;
    }
    const doTranslate = async () => {
      setIsTranslating(true);
      try {
        const translated = await services.translateText(log.text, language);
        setTranslatedText(translated);
      } catch {
        setTranslatedText('[Translation failed]');
      } finally {
        setIsTranslating(false);
      }
    };
    doTranslate();
  }, [log, language, autoTranslate]);

  return (
    <div style={{ whiteSpace: 'pre-wrap' }}>
      <span className="text-white/50">{log.timestamp.toLocaleTimeString()}</span> {log.direction === 'in' ? '⟵' : '⟶'}{' '}
      {translatedText ?? log.text}
      {isTranslating && <span className="text-white/40 italic"> (translating...)</span>}
    </div>
  );
};

// --- Center Panel ---
const CenterPanel: React.FC<{
  logs: LogEntry[];
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  connection: ConnectionType;
  connectionDetails: Record<string, any> | null;
  language: string;
  setLanguage: (lang: string) => void;
  appendLog: (text: string, direction: 'in' | 'out') => void;
  uiStrings: UIStrings;
}> = ({ logs, setLogs, connection, connectionDetails, language, setLanguage, appendLog, uiStrings }) => {
  const [cmd, setCmd] = useState('');
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [isHistoryView, setIsHistoryView] = useState(false);
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().slice(0, 10));
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const monitorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (monitorRef.current) monitorRef.current.scrollTop = monitorRef.current.scrollHeight;
  }, [logs, aiReport]);

  useEffect(() => {
    logs.forEach((log) => services.saveLog(log));
  }, [logs]);

  useEffect(() => {
    const loadHistory = async () => {
      if (isHistoryView) {
        const data = await services.loadLogsForDate(new Date(historyDate));
        setLogs(data);
      } else {
        const todayLogs = await services.loadLogsForToday();
        setLogs(todayLogs);
      }
    };
    loadHistory();
  }, [isHistoryView, historyDate]);

  const handleConnect = async (type: 'bluetooth' | 'serial') => {
    try {
      if (type === 'bluetooth') await services.connectBluetooth();
      else await services.connectSerial();
    } catch (err) {
      appendLog(`Connection failed: ${err}`, 'in');
    }
  };

  const handleSend = () => {
    if (cmd.trim()) {
      services.sendMessage(cmd);
      setCmd('');
    }
  };

  const handleAnalyze = async () => {
    if (!logs.length || isAnalyzing) return;
    setIsAnalyzing(true);
    appendLog(uiStrings.aiAnalyzing, 'out');
    try {
      const report = await services.analyzeLogsWithGemini(logs);
      setAiReport(report);
    } catch (err) {
      appendLog(`${uiStrings.aiAnalysisFailed}: ${err}`, 'in');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const renderConnectionStatus = () => {
    if (connection === ConnectionType.Disconnected || !connectionDetails) return null;
    const rssiToQuality = (rssi?: number) =>
      rssi === undefined ? 'N/A' : rssi > -60 ? 'Excellent' : rssi > -70 ? 'Good' : rssi > -80 ? 'Fair' : 'Poor';
    return (
      <div className="mt-2 p-2.5 rounded-lg bg-teal-500/20 text-sm flex justify-between">
        <div>
          <b>Connected:</b>{' '}
          {connection === ConnectionType.Bluetooth ? 'Bluetooth' : 'USB Serial'}
          {connection === ConnectionType.Bluetooth && connectionDetails.rssi !== undefined && (
            <span> | Signal: {connectionDetails.rssi} dBm ({rssiToQuality(connectionDetails.rssi)})</span>
          )}
        </div>
        <div className="flex gap-2">
          {connection === ConnectionType.Bluetooth && (
            <button onClick={services.refreshBluetoothRssi} className="px-2 py-1 bg-white/10 rounded">
              🔄
            </button>
          )}
          <button onClick={services.disconnect} className="bg-red-500/50 px-3 py-1 rounded">
            {uiStrings.disconnect}
          </button>
        </div>
      </div>
    );
  };

  const languageOptions = Object.keys(services.UI_STRINGS).map((code) => ({
    code,
    name: new Intl.DisplayNames([code], { type: 'language' }).of(code) || code,
  }));

  return (
    <div className="bg-gradient-to-b from-[#053c3a] to-[#0f574f] p-4 rounded-xl text-white flex flex-col min-h-[720px]">
      <div className="flex items-center gap-3">
        <div className="text-xl font-extrabold">Neuro Glove Assistance</div>
        <div className="ml-auto flex items-center gap-3">
          <label>{uiStrings.language}</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-white/10 p-2 rounded"
          >
            {languageOptions.map((opt) => (
              <option key={opt.code} value={opt.code} className="text-black bg-white">
                {opt.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex-1 flex flex-col">
        <div className="flex items-center gap-3">
          <div className="font-bold">{uiStrings.serialMonitor}</div>
          {connection === ConnectionType.Disconnected && (
            <div className="ml-auto flex gap-2">
              <button onClick={() => handleConnect('bluetooth')} className="border px-3 py-1 rounded">
                {uiStrings.bluetooth}
              </button>
              <button onClick={() => handleConnect('serial')} className="border px-3 py-1 rounded">
                {uiStrings.usbSerial}
              </button>
            </div>
          )}
        </div>
        {renderConnectionStatus()}

        <div className="mt-3 flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={isHistoryView}
            onChange={(e) => setIsHistoryView(e.target.checked)}
          />
          <label>{uiStrings.viewHistory}</label>
          <input
            type="date"
            value={historyDate}
            onChange={(e) => setHistoryDate(e.target.value)}
            disabled={!isHistoryView}
            className={`p-1 rounded ${!isHistoryView ? 'opacity-50 cursor-not-allowed' : ''}`}
          />
        </div>

        {aiReport && (
          <div className="mt-3 bg-purple-900/30 border border-purple-400/50 rounded p-3">
            <div className="flex justify-between mb-2">
              <b>{uiStrings.aiAnalysis}</b>
              <button onClick={() => setAiReport(null)}>✖</button>
            </div>
            <div className="text-sm whitespace-pre-wrap">{aiReport}</div>
          </div>
        )}

        <div ref={monitorRef} className="mt-3 bg-black/40 p-3 rounded flex-1 overflow-auto font-mono text-sm">
          {logs.map((log, idx) => (
            <LogLine key={idx} log={log} language={language} autoTranslate={autoTranslate} />
          ))}
        </div>

        <div className="mt-3 flex gap-2 items-center">
          <input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={uiStrings.cmdPlaceholder}
            className="flex-1 p-2 bg-white/10 rounded"
          />
          <button onClick={handleSend} className="bg-teal-600 px-3 py-1 rounded">
            {uiStrings.send}
          </button>
          <button onClick={handleAnalyze} disabled={isAnalyzing} className="bg-purple-600 px-3 py-1 rounded">
            {uiStrings.aiAnalyze}
          </button>
          <button onClick={() => setAutoTranslate(!autoTranslate)} className="bg-white/20 px-3 py-1 rounded">
            {autoTranslate ? uiStrings.translationOn : uiStrings.translationOff}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CenterPanel;
