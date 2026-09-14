"use client";

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, FileJson, BookOpen, ChevronRight, Download, Eye, AlertCircle, ExternalLink, Check, Copy, Terminal, RotateCcw, AlertTriangle, Gauge, XCircle, Upload } from 'lucide-react';
import type { RuleSetItem, ScrapedRuleSet, ScrapedDocument } from '@/lib/scraper';

interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'progress' | 'error' | 'success';
}

interface FailedDocument {
  guid: string;
  title: string;
  error: string;
}

// Throttle presets (delay between requests per thread)
const THROTTLE_PRESETS = [
  { label: 'Max Speed', value: 0, desc: 'No delay (may hit rate limits)' },
  { label: 'Fast', value: 50, desc: 'Minimal delay' },
  { label: 'Normal', value: 100, desc: 'Balanced (recommended)' },
  { label: 'Careful', value: 200, desc: 'Safer' },
  { label: 'Gentle', value: 500, desc: 'Very slow' },
];

// Concurrency presets
const CONCURRENCY_PRESETS = [
  { label: '1', value: 1, desc: 'Sequential (safest)' },
  { label: '3', value: 3, desc: 'Moderate (recommended)' },
  { label: '5', value: 5, desc: 'Fast' },
  { label: '10', value: 10, desc: 'Aggressive' },
];

export default function HomeClient() {
  const [ruleSets, setRuleSets] = useState<RuleSetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRuleSet, setSelectedRuleSet] = useState<RuleSetItem | null>(null);
  const [scraping, setScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [scrapedData, setScrapedData] = useState<ScrapedRuleSet | null>(null);
  const [showDebugView, setShowDebugView] = useState(false);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [failedDocuments, setFailedDocuments] = useState<FailedDocument[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [delayMs, setDelayMs] = useState(100); // Throttle delay between requests
  const [concurrency, setConcurrency] = useState(3); // Parallel threads
  const [eventSourceRef, setEventSourceRef] = useState<EventSource | null>(null);
  const [isUploadedData, setIsUploadedData] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    async function fetchIndex() {
      try {
        const response = await fetch('/api/index');
        if (!response?.ok) throw new Error('Failed to fetch');
        const data = await response?.json?.();
        setRuleSets(data?.ruleSets ?? []);
      } catch (err) {
        setError('Failed to load rule sets. Please try again.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchIndex();
  }, []);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const handleScrape = async (ruleSet: RuleSetItem) => {
    setSelectedRuleSet(ruleSet);
    setScraping(true);
    setScrapeProgress('Connecting...');
    setProgressPercent(0);
    setScrapedData(null);
    setShowDebugView(false);
    setLogs([]);
    setFailedDocuments([]);
    setError(null);

    addLog(`Initiating scrape for: ${ruleSet?.title}`, 'info');
    addLog(`Settings: ${delayMs}ms delay, ${concurrency} parallel threads`, 'info');

    const eventSource = new EventSource(
      `/api/scrape?guid=${encodeURIComponent(ruleSet?.guid ?? '')}&title=${encodeURIComponent(ruleSet?.title ?? '')}&delayMs=${delayMs}&concurrency=${concurrency}`
    );
    setEventSourceRef(eventSource);

    const failedDocs: FailedDocument[] = [];

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'log' || data.type === 'progress') {
          setScrapeProgress(data.message);
          setProgressPercent(data.progress ?? 0);
          addLog(data.message, data.type === 'progress' ? 'progress' : 'info');
          
          // Track failed documents from progress messages
          if (data.message?.includes('⚠️ Failed')) {
            const match = data.message.match(/Failed \[\d+\/\d+\]: (.+?) - (.+)/);
            if (match) {
              // Extract guid from the context - we'll get it from the complete data
            }
          }
        } else if (data.type === 'complete') {
          setScrapedData(data.data);
          setScrapeProgress('Complete!');
          setProgressPercent(100);
          
          // Check for failed documents by comparing structure to documents
          const docGuids = new Set((data.data?.documents ?? []).map((d: ScrapedDocument) => d.guid));
          const failed: FailedDocument[] = [];
          
          const findMissingDocs = (nodes: any[]) => {
            for (const node of nodes ?? []) {
              if (node.type === 'document' && !docGuids.has(node.guid)) {
                failed.push({ guid: node.guid, title: node.title, error: 'Failed to scrape' });
              }
              if (node.children) {
                findMissingDocs(node.children);
              }
            }
          };
          findMissingDocs(data.data?.structure ?? []);
          
          setFailedDocuments(failed);
          if (failed.length > 0) {
            addLog(`Completed with ${failed.length} failed document(s)`, 'error');
          } else {
            addLog('Scrape completed successfully!', 'success');
          }
          setScraping(false);
          eventSource.close();
        } else if (data.type === 'error') {
          setError(data.message);
          addLog(data.message, 'error');
          setScraping(false);
          eventSource.close();
        }
      } catch (err) {
        console.error('Failed to parse SSE message:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE error:', err);
      if (scraping) {
        setError('Connection lost. The scrape may have timed out or failed.');
        addLog('Connection error - scrape may have failed', 'error');
        setScraping(false);
      }
      eventSource.close();
    };
  };

  const handleRetryFailed = async () => {
    if (failedDocuments.length === 0 || !scrapedData) return;
    
    setRetrying(true);
    addLog(`Retrying ${failedDocuments.length} failed document(s)...`, 'info');

    try {
      const response = await fetch('/api/retry-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents: failedDocuments }),
      });

      if (!response.ok) {
        throw new Error('Retry request failed');
      }

      const result = await response.json();
      
      // Add successful documents to scrapedData
      if (result.succeeded?.length > 0) {
        const newDocs = result.succeeded.map((s: any) => s.document);
        setScrapedData(prev => prev ? {
          ...prev,
          documents: [...prev.documents, ...newDocs],
          metadata: {
            ...prev.metadata,
            totalDocuments: prev.metadata.totalDocuments + newDocs.length,
          }
        } : null);
        
        addLog(`Successfully retried ${result.succeeded.length} document(s)`, 'success');
      }

      // Update failed documents list
      if (result.failed?.length > 0) {
        setFailedDocuments(result.failed);
        addLog(`${result.failed.length} document(s) still failed`, 'error');
      } else {
        setFailedDocuments([]);
        addLog('All documents recovered!', 'success');
      }
    } catch (err) {
      addLog(`Retry failed: ${(err as Error).message}`, 'error');
    } finally {
      setRetrying(false);
    }
  };

  const handleDownload = () => {
    if (!scrapedData) return;
    const blob = new Blob([JSON.stringify(scrapedData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(scrapedData?.title ?? 'rules')?.replace?.(/[^a-z0-9]/gi, '_')?.toLowerCase?.() ?? 'rules'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyToClipboard = async () => {
    if (!scrapedData) return;
    try {
      await navigator?.clipboard?.writeText?.(JSON.stringify(scrapedData, null, 2));
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCancel = () => {
    if (eventSourceRef) {
      eventSourceRef.close();
      setEventSourceRef(null);
    }
    setScraping(false);
    setScrapeProgress('Cancelled by user');
    addLog('⛔ Scrape cancelled by user', 'error');
  };

  const clearSelection = () => {
    if (eventSourceRef) {
      eventSourceRef.close();
      setEventSourceRef(null);
    }
    setSelectedRuleSet(null);
    setScrapedData(null);
    setShowDebugView(false);
    setScrapeProgress('');
    setScraping(false);
    setError(null);
    setIsUploadedData(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        
        // Validate that it looks like a ScrapedRuleSet
        if (!parsed.title || !parsed.documents || !parsed.structure) {
          setError('Invalid JSON format. Expected a scraped rule set with title, documents, and structure fields.');
          return;
        }

        // Create a synthetic selectedRuleSet from the uploaded data
        setSelectedRuleSet({
          title: parsed.title,
          guid: parsed.guid || 'uploaded',
          url: parsed.sourceUrl || '#',
          type: 'category',
        });
        setScrapedData(parsed);
        setShowDebugView(true);
        setScraping(false);
        setScrapeProgress('');
        setError(null);
        setFailedDocuments([]);
        setLogs([]);
        setIsUploadedData(true);
      } catch (err) {
        setError('Failed to parse JSON file. Please make sure it is a valid JSON file.');
      }
    };
    reader.readAsText(file);

    // Reset the input so the same file can be re-uploaded
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
        <span className="ml-3 text-slate-600 dark:text-slate-300">Loading rule sets...</span>
      </div>
    );
  }

  if (error && !scrapedData) {
    return (
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-6 flex items-start gap-3">
        <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-red-800 dark:text-red-300">Error</h3>
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => { setError(null); window?.location?.reload?.(); }}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Rule Set List */}
      <AnimatePresence mode="wait">
        {!selectedRuleSet && (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            {/* Speed Controls */}
            <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-3">
                <Gauge className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                <h3 className="font-medium text-slate-700 dark:text-slate-300">Speed Settings</h3>
              </div>
              
              {/* Concurrency */}
              <div className="mb-4">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                  Parallel threads: <span className="font-medium">{concurrency}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {CONCURRENCY_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => setConcurrency(preset.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        concurrency === preset.value
                          ? 'bg-green-600 text-white'
                          : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-green-300 dark:hover:border-green-500'
                      }`}
                      title={preset.desc}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Delay */}
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                  Delay between requests: <span className="font-medium">{delayMs}ms</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {THROTTLE_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => setDelayMs(preset.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        delayMs === preset.value
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-500'
                      }`}
                      title={preset.desc}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min="0"
                  max="1000"
                  step="25"
                  value={delayMs}
                  onChange={(e) => setDelayMs(parseInt(e.target.value, 10))}
                  className="w-full mt-2 accent-blue-600"
                />
              </div>
              
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
                💡 Higher threads + lower delay = faster, but may hit rate limits. Start with defaults and adjust if needed.
              </p>
            </div>

            {/* Upload Previously Downloaded JSON */}
            <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800 border-dashed">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                    <Upload className="w-5 h-5" />
                    View Previously Downloaded Rules
                  </h3>
                  <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                    Upload a JSON file from a previous scrape to browse it in the viewer
                  </p>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition shadow-sm flex items-center gap-2 text-sm font-medium"
                >
                  <Upload className="w-4 h-4" />
                  Upload JSON
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Available Rule Sets ({ruleSets?.length ?? 0})
            </h2>
            <div className="grid gap-3">
              {(ruleSets ?? [])?.map?.((ruleSet, index) => (
                <motion.button
                  key={ruleSet?.guid ?? index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => handleScrape(ruleSet)}
                  className="group flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-xl shadow-sm hover:shadow-md border border-slate-100 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-600 transition-all text-left"
                >
                  <div className="flex items-center gap-3">
                    <FileJson className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                    <span className="text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                      {ruleSet?.title ?? 'Untitled'}
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-500 dark:group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Selected Rule Set View */}
        {selectedRuleSet && (
          <motion.div
            key="selected"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Header */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">{selectedRuleSet?.title ?? 'Untitled'}</h2>
                    {isUploadedData && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-full">
                        Uploaded
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 mt-1">
                    {isUploadedData ? 'Viewing previously downloaded rule set' : `GUID: ${selectedRuleSet?.guid ?? 'N/A'}`}
                  </p>
                </div>
                <button
                  onClick={clearSelection}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                >
                  ← Back to list
                </button>
              </div>

              {/* Progress */}
              {scraping && (
                <div className="mt-6 space-y-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400" />
                        <span className="text-blue-700 dark:text-blue-300 font-medium">{scrapeProgress ?? 'Scraping...'}</span>
                      </div>
                      <button
                        onClick={handleCancel}
                        className="px-3 py-1.5 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg hover:bg-red-200 dark:hover:bg-red-800/50 transition flex items-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" />
                        Cancel
                      </button>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-3 h-2 bg-blue-200 dark:bg-blue-900 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <p className="text-blue-600 dark:text-blue-400 text-sm mt-2">
                      Progress: {progressPercent}% • {concurrency} parallel threads, {delayMs}ms delay
                    </p>
                  </div>
                  
                  {/* Log Panel */}
                  <div className="bg-slate-900 rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 border-b border-slate-700">
                      <Terminal className="w-4 h-4 text-green-400" />
                      <span className="text-sm font-medium text-slate-200">Activity Log</span>
                      <span className="text-xs text-slate-500 ml-auto">{logs.length} entries</span>
                    </div>
                    <div 
                      ref={logContainerRef}
                      className="p-3 h-48 overflow-y-auto font-mono text-xs space-y-1"
                    >
                      {logs.map((log, index) => (
                        <div 
                          key={index}
                          className={`flex gap-2 ${
                            log.type === 'error' ? 'text-red-400' :
                            log.type === 'success' ? 'text-green-400' :
                            log.type === 'progress' ? 'text-blue-400' :
                            'text-slate-400'
                          }`}
                        >
                          <span className="text-slate-600 flex-shrink-0">[{log.timestamp}]</span>
                          <span className="break-all">{log.message}</span>
                        </div>
                      ))}
                      {logs.length === 0 && (
                        <span className="text-slate-600">Waiting for activity...</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Error display */}
              {error && !scraping && (
                <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-red-700 dark:text-red-300 font-medium">Scrape Failed</p>
                      <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>
                      <button
                        onClick={() => selectedRuleSet && handleScrape(selectedRuleSet)}
                        className="mt-3 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition"
                      >
                        Try Again
                      </button>
                    </div>
                  </div>
                  {/* Show logs even on error */}
                  {logs.length > 0 && (
                    <div className="mt-4 bg-slate-900 rounded-lg overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 border-b border-slate-700">
                        <Terminal className="w-4 h-4 text-red-400" />
                        <span className="text-sm font-medium text-slate-200">Activity Log (for debugging)</span>
                      </div>
                      <div className="p-3 h-32 overflow-y-auto font-mono text-xs space-y-1">
                        {logs.map((log, index) => (
                          <div 
                            key={index}
                            className={`flex gap-2 ${
                              log.type === 'error' ? 'text-red-400' :
                              log.type === 'success' ? 'text-green-400' :
                              log.type === 'progress' ? 'text-blue-400' :
                              'text-slate-400'
                            }`}
                          >
                            <span className="text-slate-600 flex-shrink-0">[{log.timestamp}]</span>
                            <span className="break-all">{log.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Results */}
              {scrapedData && !scraping && (
                <div className="mt-6 space-y-4">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <Check className="w-5 h-5" />
                    <span>Scrape complete!</span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                      <p className="text-sm text-slate-500 dark:text-slate-400">Documents</p>
                      <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{scrapedData?.metadata?.totalDocuments ?? 0}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                      <p className="text-sm text-slate-500 dark:text-slate-400">Categories</p>
                      <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{scrapedData?.metadata?.totalCategories ?? 0}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                      <p className="text-sm text-slate-500 dark:text-slate-400">{isUploadedData ? 'Originally Scraped' : 'Scraped At'}</p>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {new Date(scrapedData?.scrapedAt ?? '').toLocaleString()}
                      </p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                      <p className="text-sm text-slate-500 dark:text-slate-400">JSON Size</p>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {((JSON?.stringify?.(scrapedData)?.length ?? 0) / 1024)?.toFixed?.(1) ?? '0'} KB
                      </p>
                    </div>
                  </div>

                  {/* Failed Documents Warning */}
                  {failedDocuments.length > 0 && (
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-amber-700 dark:text-amber-300 font-medium">
                            {failedDocuments.length} document(s) failed to scrape
                          </p>
                          <p className="text-amber-600 dark:text-amber-400 text-sm mt-1">
                            These documents timed out or encountered errors. You can retry them without re-scraping the entire rule set.
                          </p>
                          <div className="mt-3 max-h-32 overflow-y-auto">
                            <ul className="text-sm text-amber-600 dark:text-amber-400 space-y-1">
                              {failedDocuments.slice(0, 5).map((doc, i) => (
                                <li key={doc.guid} className="truncate">• {doc.title}</li>
                              ))}
                              {failedDocuments.length > 5 && (
                                <li className="text-amber-500">...and {failedDocuments.length - 5} more</li>
                              )}
                            </ul>
                          </div>
                          <button
                            onClick={handleRetryFailed}
                            disabled={retrying}
                            className="mt-3 flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          >
                            {retrying ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Retrying...
                              </>
                            ) : (
                              <>
                                <RotateCcw className="w-4 h-4" />
                                Retry Failed Documents
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleDownload}
                      className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm"
                    >
                      <Download className="w-4 h-4" />
                      Download JSON
                    </button>
                    <button
                      onClick={() => setShowDebugView(!showDebugView)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                    >
                      <Eye className="w-4 h-4" />
                      {showDebugView ? 'Hide' : 'Show'} {isUploadedData ? 'Rule Browser' : 'Debug View'}
                    </button>
                    <button
                      onClick={handleCopyToClipboard}
                      className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                    >
                      {copiedToClipboard ? <Check className="w-4 h-4 text-green-600 dark:text-green-400" /> : <Copy className="w-4 h-4" />}
                      {copiedToClipboard ? 'Copied!' : 'Copy to Clipboard'}
                    </button>
                    {selectedRuleSet?.url && selectedRuleSet.url !== '#' && (
                      <a
                        href={selectedRuleSet.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-5 py-2.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900 transition"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View on WestLaw
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Debug View */}
            {showDebugView && scrapedData && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden"
              >
                <div className="border-b border-slate-100 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-700/50">
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100">{isUploadedData ? 'Rule Browser' : 'Debug / Verify View'}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Hierarchical structure with links to original WestLaw pages</p>
                </div>
                <div className="p-4 max-h-[600px] overflow-y-auto">
                  <DebugTreeView structure={scrapedData?.structure ?? []} documents={scrapedData?.documents ?? []} />
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DebugTreeView({ structure, documents }: { structure: any[]; documents: any[] }) {
  const docMap = new Map((documents ?? [])?.map?.((d: any) => [d?.guid, d]) ?? []);

  const renderNode = (node: any, depth: number = 0) => {
    const isDocument = node?.type === 'document';
    const doc = isDocument ? docMap?.get?.(node?.guid) : null;
    const isMissing = isDocument && !doc;

    return (
      <div key={node?.guid ?? Math.random()} style={{ marginLeft: depth * 20 }} className="my-2">
        <div className="flex items-start gap-2">
          {isDocument ? (
            <FileJson className={`w-4 h-4 mt-1 flex-shrink-0 ${isMissing ? 'text-red-500' : 'text-blue-500 dark:text-blue-400'}`} />
          ) : (
            <BookOpen className="w-4 h-4 text-amber-500 mt-1 flex-shrink-0" />
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className={`font-medium ${isMissing ? 'text-red-600 dark:text-red-400' : isDocument ? 'text-slate-700 dark:text-slate-200' : 'text-slate-800 dark:text-slate-100'}`}>
                {node?.title ?? 'Untitled'}
                {isMissing && <span className="text-xs ml-2">(failed)</span>}
              </span>
              <a
                href={node?.url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                WestLaw
              </a>
            </div>
            {doc && (
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400 space-y-1">
                {doc?.citation && <p>Citation: {doc?.citation}</p>}
                {doc?.currentness && <p>Currentness: {doc?.currentness}</p>}
                {doc?.content && (
                  <p className="text-xs bg-slate-50 dark:bg-slate-700 p-2 rounded mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {(doc?.content ?? '')?.substring?.(0, 500) ?? ''}{(doc?.content?.length ?? 0) > 500 ? '...' : ''}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        {(node?.children ?? [])?.length > 0 && (
          <div className="border-l-2 border-slate-100 dark:border-slate-600 ml-2 mt-1">
            {(node?.children ?? [])?.map?.((child: any) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!structure?.length) {
    return <p className="text-slate-500 dark:text-slate-400">No structure data available.</p>;
  }

  return (
    <div>
      {(structure ?? [])?.map?.((node: any) => renderNode(node, 0))}
    </div>
  );
}