
import React, { useState, useEffect, useRef } from 'react';
import { LogEntry, ConnectionType, UIStrings } from '../services';
import * as services from '../services';

// Inlined LogLine component for code consolidation
const LogLine: React.FC<{ log: LogEntry; language: string; autoTranslate: boolean; }> = ({ log, language, autoTranslate }) => {
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  
  useEffect(() => {
    if (!autoTranslate || log.direction === 'out' || language === 'en') {
      setTranslatedText(null); setIsTranslating(false); return;
    }
    const doTranslate = async () => {
      setIsTranslating(true);
      try {
        setTranslatedText(await services.translateText(log.text, language));
      } catch (error) {
        console.error("Translation failed:", error);
        setTranslatedText(`[Translation failed]`);
      } finally { setIsTranslating(false); }
    };
    doTranslate();
  }, [log, language, autoTranslate]);
  
  const textToShow = autoTranslate && translatedText ? translatedText : log.text;
  
  return (
    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      <span className="text-white/50">{log.timestamp.toLocaleTimeString()}</span> {log.direction === 'in' ? '⟵' : '⟶'} {textToShow}
      {isTranslating && <span className="text-white/40 italic"> (translating...)</span>}
    </div>
  );
};

// Main CenterPanel component
const CenterPanel: React.FC<{ logs: LogEntry[]; setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>; connection: ConnectionType; connectionDetails: Record<string, any> | null; language: string; setLanguage: (lang: string) => void; appendLog: (text: string, direction: 'in' | 'out') => void; uiStrings: UIStrings; }> = ({ logs, setLogs, connection, connectionDetails, language, setLanguage, appendLog, uiStrings }) => {
  const [cmd, setCmd] = useState('');
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [isHistoryView, setIsHistoryView] = useState(false);
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().slice(0, 10));
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const monitorRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (monitorRef.current) monitorRef.current.scrollTop = monitorRef.current.scrollHeight; }, [logs, aiReport]);
  useEffect(() => { logs.forEach(log => services.saveLog(log)); }, [logs]);
  useEffect(() => {
    const loadHistory = async () => {
      if (isHistoryView) setLogs(await services.loadLogsForDate(new Date(historyDate)));
      else setLogs([]); // Clear for live view
    };
    loadHistory();
  }, [isHistoryView, historyDate, setLogs]);

  const handleConnect = async (type: 'bluetooth' | 'serial') => {
  try {
    if (type === 'bluetooth') {
      await services.connectBluetooth();
    } else {
      await services.connectSerial({ baudRate: 9600 }); // ✅ Set baud rate here
    }
  } catch (error) {
    appendLog(`Connection failed: ${error instanceof Error ? error.message : String(error)}`, 'in');
  }
};

  const handleSend = () => { if (cmd.trim()) { services.sendMessage(cmd); setCmd(''); } };
  const handleAnalyze = async () => {
      if (!logs.length || isAnalyzing) return;
      setIsAnalyzing(true);
      setAiReport(null);
      appendLog(uiStrings.aiAnalyzing, 'out');
      try {
        const result = await services.analyzeLogsWithGemini(logs);
        setAiReport(result);
      } catch (error) { 
        appendLog(`${uiStrings.aiAnalysisFailed} ${error instanceof Error ? error.message : String(error)}`, 'in');
      } finally { 
        setIsAnalyzing(false); 
      }
    };

  const renderConnectionStatus = () => {
    if (connection === ConnectionType.Disconnected || !connectionDetails) return null;
    const rssiToQuality = (rssi: number | undefined) => {
        if (rssi === undefined) return 'N/A';
        if (rssi > -60) return 'Excellent'; if (rssi > -70) return 'Good'; if (rssi > -80) return 'Fair'; return 'Poor';
    };
    return (
      <div className="mt-2 p-2.5 rounded-lg bg-teal-500/20 text-sm flex items-center justify-between gap-3 animate-fade-in">
          <div>
              <span className="font-bold text-white/90">Connected: {connection === ConnectionType.Bluetooth ? 'Bluetooth' : 'USB Serial'}</span>
              {connection === ConnectionType.Bluetooth && connectionDetails.rssi !== undefined && <span className="text-white/70 text-xs">Signal: {connectionDetails.rssi} dBm ({rssiToQuality(connectionDetails.rssi)})</span>}
              {connection === ConnectionType.Serial && <span className="text-white/70 text-xs">{connectionDetails.baudRate && `Speed: ${connectionDetails.baudRate} bps`}{connectionDetails.usbVendorId && ` | Port: USB (VID:${connectionDetails.usbVendorId}, PID:${connectionDetails.usbProductId})`}</span>}
          </div>
          <div className="flex items-center gap-2">
            {connection === ConnectionType.Bluetooth && <button onClick={services.refreshBluetoothRssi} className="bg-transparent border border-white/20 p-1.5 rounded-lg hover:bg-white/10" title="Refresh Signal"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M13 3a9 9 0 00-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21a9 9 0 009-9c0-4.97-4.03-9-9-9z"/></svg></button>}
            <button onClick={services.disconnect} className="bg-red-500/50 border border-red-400/50 px-3 py-1.5 text-sm rounded-lg hover:bg-red-500/80 transition">{uiStrings.disconnect}</button>
          </div>
      </div>
    );
  };
  const languageOptions = Object.keys(services.UI_STRINGS).map(code => ({ code, name: new Intl.DisplayNames([code], { type: 'language' }).of(code) || code }));
  return (
    <div className="bg-gradient-to-b from-[#053c3a] to-[#0f574f] rounded-xl p-4 shadow-lg text-white flex flex-col min-h-[720px]">
      <div className="flex items-center gap-3">
        <div className="text-xl font-extrabold">Neuro Glove Assistance</div>
        <div className="ml-auto flex items-center gap-3">
          <label htmlFor="lang" className="text-sm text-white/80">{uiStrings.language}</label>
          <select id="lang" value={language} onChange={(e) => setLanguage(e.target.value)} className="bg-white/10 p-2 rounded-lg border-0 text-white focus:outline-none focus:ring-2 focus:ring-teal-400">
            {languageOptions.map(opt => <option key={opt.code} value={opt.code} className="text-black bg-white">{opt.name.charAt(0).toUpperCase() + opt.name.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-3 bg-gradient-to-b from-white/5 to-white/0 p-3 rounded-xl flex-1 flex flex-col">
        <div className="flex items-center gap-3">
          <div className="font-bold">{uiStrings.serialMonitor}</div>
          {connection === ConnectionType.Disconnected && (
             <div className="ml-auto flex gap-2">
                <button onClick={() => handleConnect('bluetooth')} className="bg-transparent border border-white/20 px-3 py-1.5 text-sm rounded-lg hover:bg-white/10">{uiStrings.bluetooth}</button>
                <button onClick={() => handleConnect('serial')} className="bg-transparent border border-white/20 px-3 py-1.5 text-sm rounded-lg hover:bg-white/10">{uiStrings.usbSerial}</button>
             </div>
          )}
        </div>
        {renderConnectionStatus()}
        <div className="mt-3 flex items-center gap-3 text-sm text-white/90">
            <input type="checkbox" id="viewHistoryChk" checked={isHistoryView} onChange={(e) => setIsHistoryView(e.target.checked)} className="form-checkbox bg-white/20 border-white/30 rounded text-teal-400 focus:ring-teal-300" />
            <label htmlFor="viewHistoryChk">{uiStrings.viewHistory}</label>
            <div className={`relative inline-flex items-center rounded-md p-1 transition-all ${!isHistoryView ? 'bg-white/20 opacity-50 cursor-not-allowed' : 'bg-white/90 cursor-pointer'}`}>
              <span className={`text-xs pointer-events-none ${!isHistoryView ? 'text-white/70' : 'text-black'}`}>{historyDate}</span>
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ml-2 pointer-events-none ${!isHistoryView ? 'text-white/70' : 'text-gray-600'}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zM4.75 9.75a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5h-8.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
              </svg>
              <input
                id="historyDate"
                type="date"
                value={historyDate}
                onChange={(e) => setHistoryDate(e.target.value)}
                disabled={!isHistoryView}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
            </div>
        </div>
        {aiReport && (
          <div className="mt-3 bg-purple-900/30 border border-purple-400/50 rounded-lg p-3 animate-fade-in">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2 font-bold text-purple-200">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 2a1 1 0 00-1 1v14a1 1 0 001 1h10a1 1 0 001-1V3a1 1 0 00-1-1H5zm0 2h10v12H5V4zm2 5a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm0 4a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                <span>{uiStrings.aiAnalysis}</span>
              </div>
              <button onClick={() => setAiReport(null)} className="text-xl font-bold text-purple-300 hover:text-white leading-none">&times;</button>
            </div>
            <div className="text-sm text-purple-100/90 whitespace-pre-wrap font-mono bg-black/20 p-2 rounded-md max-h-40 overflow-auto">{aiReport}</div>
          </div>
        )}
        <div ref={monitorRef} className="mt-3 bg-black/40 rounded-lg p-3 h-96 overflow-auto font-mono text-sm text-teal-200/90 leading-relaxed flex-1">
          {logs.map((log, index) => <LogLine key={index} log={log} language={language} autoTranslate={autoTranslate} />)}
        </div>
        <div className="mt-3 flex gap-2 items-center">
          <input type="text" value={cmd} onChange={e => setCmd(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder={uiStrings.cmdPlaceholder} className="flex-1 p-2.5 rounded-lg border-0 bg-white/10 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-teal-400" />
          <button onClick={handleSend} className="bg-teal-500 text-white px-4 py-2.5 rounded-lg font-bold hover:bg-teal-600">{uiStrings.send}</button>
          <button onClick={handleAnalyze} disabled={isAnalyzing || logs.length === 0} title={uiStrings.analyze} className="bg-purple-600 text-white p-2.5 rounded-lg font-bold hover:bg-purple-700 transition disabled:bg-purple-400/80 disabled:cursor-not-allowed">
            {isAnalyzing ? <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 2a1 1 0 00-1 1v14a1 1 0 001 1h10a1 1 0 001-1V3a1 1 0 00-1-1H5zm0 2h10v12H5V4zm2 5a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm0 4a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd" /></svg>}
          </button>
          <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={autoTranslate} onChange={e => setAutoTranslate(e.target.checked)} className="form-checkbox bg-white/20 border-white/30 rounded text-teal-400 focus:ring-teal-300" /> {uiStrings.autoTranslate}
          </label>
        </div>
      </div>
      <footer className="mt-3 text-xs text-white/70 flex justify-between">
          <div>Please enable permisssions for  Bluetooth, Serial, Geolocation</div>
          <div>Supports Web Serial.</div>
      </footer>
    </div>
  );
};
export default CenterPanel;
