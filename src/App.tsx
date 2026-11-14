import React, { useState, useRef, useEffect } from 'react';
import { Bookmark, BookmarkCheck, List, ArrowLeft, Eraser, PenTool, Settings, Download, Upload, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { jsPDF } from 'jspdf';

interface PageData {
  id: string;
  dataUrl: string;
  isBookmarked: boolean;
  title: string;
}

export default function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [coverImage, setCoverImage] = useState<string>(() => {
    return localStorage.getItem('journal_cover') || '';
  });

  const [pages, setPages] = useState<PageData[]>(() => {
    const saved = localStorage.getItem('analog_diary_pages');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return [{
      id: '1',
      dataUrl: '',
      isBookmarked: false,
      title: 'Page 1'
    }];
  });

  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [canvasReloadTrigger, setCanvasReloadTrigger] = useState(0);
  const [toolMode, setToolMode] = useState<'blue' | 'black' | 'eraser'>('blue');
  const [showIndexModal, setShowIndexModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [paperStyle, setPaperStyle] = useState<'ruled' | 'unruled'>(() => {
    return (localStorage.getItem('journal_paper_style') as 'ruled' | 'unruled') || 'ruled';
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);

  // Lock orientation to portrait mode on mount
  useEffect(() => {
    const lockPortrait = async () => {
      try {
        await ScreenOrientation.lock({ orientation: 'portrait' });
      } catch (e) {
        console.log('Orientation lock not supported in web browser, will apply on Android APK.');
      }
    };
    lockPortrait();
  }, []);

  // Load drawing and setup high-DPI crisp canvas ONLY when page changes, book opens, or backup imports (NO BLINK ON STROKE)
  useEffect(() => {
    if (isOpen && canvasRef.current) {
      const canvas = canvasRef.current;
      const dpr = window.devicePixelRatio || 1;
      
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        const currentPage = pages[currentPageIndex];
        if (currentPage && currentPage.dataUrl) {
          const img = new Image();
          img.src = currentPage.dataUrl;
          img.onload = () => { 
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(img, 0, 0, window.innerWidth, window.innerHeight); 
          };
        }
      }
    }
    // Intentionally excluding `pages` so finishing a stroke never clears/blinks the active canvas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentPageIndex, canvasReloadTrigger]);

  // Returns latest pages array with current canvas saved
  const getLatestPages = (): PageData[] => {
    const canvas = canvasRef.current;
    if (!canvas || !isOpen) return pages;
    const dataUrl = canvas.toDataURL('image/png');
    const updated = [...pages];
    updated[currentPageIndex] = { ...updated[currentPageIndex], dataUrl };
    setPages(updated);
    localStorage.setItem('analog_diary_pages', JSON.stringify(updated));
    return updated;
  };

  const saveCurrentPage = () => {
    getLatestPages();
  };

  // --- DEDICATED PREVIOUS & NEXT PAGE HANDLERS ---
  const goToPreviousPage = () => {
    saveCurrentPage();
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
    } else {
      setIsOpen(false);
    }
  };

  const goToNextPage = () => {
    const latest = getLatestPages();
    if (currentPageIndex < latest.length - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
    } else {
      const newPage: PageData = {
        id: Date.now().toString(),
        dataUrl: '',
        isBookmarked: false,
        title: `Page ${latest.length + 1}`
      };
      const updated = [...latest, newPage];
      setPages(updated);
      localStorage.setItem('analog_diary_pages', JSON.stringify(updated));
      setCurrentPageIndex(currentPageIndex + 1);
    }
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setCoverImage(result);
        localStorage.setItem('journal_cover', result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePaperStyleChange = (style: 'ruled' | 'unruled') => {
    setPaperStyle(style);
    localStorage.setItem('journal_paper_style', style);
  };

  // --- REAL .JSON FILE EXPORT VIA CACHE + NATIVE SHARE ---
  const exportJSON = async () => {
    const latestPages = getLatestPages();
    const data = {
      version: 1,
      coverImage,
      paperStyle,
      pages: latestPages
    };
    const jsonString = JSON.stringify(data, null, 2);
    const fileName = `dairy_backup_${Date.now()}.json`;

    try {
      const writtenFile = await Filesystem.writeFile({
        path: fileName,
        data: jsonString,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });

      await Share.share({
        title: fileName,
        files: [writtenFile.uri],
        dialogTitle: 'Save or Share JSON Backup',
      });
    } catch (err) {
      console.error('Native JSON file share fallback:', err);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // --- ROBUST JSON IMPORT ---
  const importJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawText = (event.target?.result as string) || '';
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        if (firstBrace === -1 || lastBrace === -1) {
          throw new Error('No JSON object found in file');
        }
        const cleanJson = rawText.slice(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(cleanJson);

        if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
          setPages(parsed.pages);
          setCurrentPageIndex(0);
          setCanvasReloadTrigger(prev => prev + 1);
          localStorage.setItem('analog_diary_pages', JSON.stringify(parsed.pages));
        } else {
          throw new Error('Missing pages array');
        }

        if (typeof parsed.coverImage === 'string') {
          setCoverImage(parsed.coverImage);
          localStorage.setItem('journal_cover', parsed.coverImage);
        }
        if (parsed.paperStyle === 'ruled' || parsed.paperStyle === 'unruled') {
          setPaperStyle(parsed.paperStyle);
          localStorage.setItem('journal_paper_style', parsed.paperStyle);
        }

        alert('Backup restored successfully!');
        setShowSettingsModal(false);
      } catch (err) {
        console.error('Import error:', err);
        alert('Invalid backup file. Please select a valid Dairy .json backup.');
      } finally {
        if (importFileRef.current) {
          importFileRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  // Helper to load base64 image onto offscreen canvas
  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = src;
    });
  };

  // --- REAL BINARY .PDF GENERATOR & NATIVE ANDROID DOWNLOAD/SHARE ---
  const exportPDF = async () => {
    if (isExportingPDF) return;
    setIsExportingPDF(true);

    try {
      const latestPages = getLatestPages();
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < latestPages.length; i++) {
        if (i > 0) {
          pdf.addPage();
        }

        const p = latestPages[i];
        const offCanvas = document.createElement('canvas');
        const scale = 2;
        offCanvas.width = pageWidth * scale;
        offCanvas.height = pageHeight * scale;
        const ctx = offCanvas.getContext('2d');

        if (ctx) {
          ctx.scale(scale, scale);

          // 1. Cream paper background
          ctx.fillStyle = '#fbf9f1';
          ctx.fillRect(0, 0, pageWidth, pageHeight);

          // 2. Ruled lines if enabled
          if (paperStyle === 'ruled') {
            ctx.strokeStyle = '#d1d5db';
            ctx.lineWidth = 1;
            const lineSpacing = 28;
            for (let y = 56; y < pageHeight - 40; y += lineSpacing) {
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(pageWidth, y);
              ctx.stroke();
            }
          }

          // 3. Draw handwritten ink strokes
          if (p.dataUrl) {
            try {
              const inkImg = await loadImage(p.dataUrl);
              ctx.drawImage(inkImg, 0, 0, pageWidth, pageHeight);
            } catch (imgErr) {
              console.warn('Could not load page image for PDF:', imgErr);
            }
          }

          // 4. Subtle footer
          ctx.fillStyle = '#78716c';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'right';
          const footerText = `Page ${i + 1}${p.isBookmarked && p.title ? ` — ${p.title}` : ''}`;
          ctx.fillText(footerText, pageWidth - 24, pageHeight - 18);
        }

        const pageJpeg = offCanvas.toDataURL('image/jpeg', 0.92);
        pdf.addImage(pageJpeg, 'JPEG', 0, 0, pageWidth, pageHeight);
      }

      const fileName = `dairy_journal_${Date.now()}.pdf`;
      const pdfDataUri = pdf.output('datauristring');
      const base64Pdf = pdfDataUri.split(',')[1];

      try {
        const writtenPdf = await Filesystem.writeFile({
          path: fileName,
          data: base64Pdf,
          directory: Directory.Cache,
        });

        await Share.share({
          title: fileName,
          files: [writtenPdf.uri],
          dialogTitle: 'Save or Share Journal PDF',
        });
      } catch (nativeErr) {
        console.log('Falling back to browser PDF download:', nativeErr);
        pdf.save(fileName);
      }
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('Failed to generate PDF: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsExportingPDF(false);
    }
  };

  const toggleBookmark = () => {
    const updated = [...pages];
    const current = updated[currentPageIndex];
    current.isBookmarked = !current.isBookmarked;
    
    if (current.isBookmarked) {
      const customTitle = prompt("Enter topic name for this bookmark:", `Topic on Page ${currentPageIndex + 1}`);
      if (customTitle) current.title = customTitle;
    }

    setPages(updated);
    localStorage.setItem('analog_diary_pages', JSON.stringify(updated));
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();

    if (toolMode === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 24;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = toolMode === 'blue' ? '#1e3a8a' : '#09090b';
      ctx.lineWidth = 2.5;
    }

    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    saveCurrentPage();
  };

  return (
    <div className="fixed inset-0 bg-stone-950 overflow-hidden select-none">
      
      {/* --- FULLSCREEN COVER SCREEN --- */}
      <div 
        onClick={() => setIsOpen(true)}
        className={`absolute inset-0 w-full h-full flex items-center justify-center bg-stone-950 cursor-pointer transition-opacity duration-500 ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      >
        <div className="absolute inset-0 w-full h-full bg-zinc-950 flex flex-col justify-center items-center">
          {coverImage ? (
            <img src={coverImage} alt="Cover" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="text-center text-zinc-300 p-8">
              <h1 className="text-4xl font-serif tracking-widest mb-2">Dairy</h1>
              <p className="text-xs uppercase tracking-widest opacity-60">Tap anywhere to open</p>
            </div>
          )}

          <div className="absolute bottom-6 right-6 z-20">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleCoverUpload} 
              accept="image/*" 
              className="hidden" 
            />
            <button 
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              className="text-xs bg-black/40 hover:bg-black/70 backdrop-blur text-zinc-200 px-4 py-2 rounded-full border border-zinc-700/50 shadow transition-all"
            >
              Upload Cover
            </button>
          </div>
        </div>
      </div>

      {/* --- OPEN NOTEBOOK PAGE --- */}
      <div className={`absolute inset-0 w-full h-full bg-[#fbf9f1] text-stone-800 flex flex-col transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        
        {/* Top Left Controls */}
        <div className="absolute top-3 left-3 z-30 flex items-center gap-2">
          <button 
            onClick={(e) => { e.stopPropagation(); saveCurrentPage(); setIsOpen(false); }}
            className="flex items-center gap-1 text-xs bg-transparent hover:bg-stone-200/40 text-stone-700 px-2.5 py-1.5 rounded-lg border border-stone-300/40 backdrop-blur transition-all cursor-pointer font-medium"
          >
            <ArrowLeft size={14} /> Close
          </button>

          <button 
            onClick={(e) => { e.stopPropagation(); toggleBookmark(); }}
            className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border backdrop-blur transition-all cursor-pointer font-medium ${
              pages[currentPageIndex]?.isBookmarked 
                ? 'bg-amber-600/80 text-white border-amber-700/60' 
                : 'bg-transparent hover:bg-stone-200/40 text-stone-700 border-stone-300/40'
            }`}
          >
            {pages[currentPageIndex]?.isBookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
            {pages[currentPageIndex]?.isBookmarked ? 'Bookmarked' : 'Bookmark'}
          </button>

          <button 
            onClick={(e) => { e.stopPropagation(); saveCurrentPage(); setShowIndexModal(true); }}
            className="flex items-center gap-1 text-xs bg-transparent hover:bg-stone-200/40 text-stone-700 px-2.5 py-1.5 rounded-lg border border-stone-300/40 backdrop-blur transition-all cursor-pointer font-medium"
          >
            <List size={14} /> Index
          </button>
        </div>

        {/* Top Right Settings Button */}
        <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
          <span className="text-xs text-stone-400 font-serif mr-1">
            Page {currentPageIndex + 1} / {pages.length}
          </span>
          <button 
            onClick={(e) => { e.stopPropagation(); saveCurrentPage(); setShowSettingsModal(true); }}
            className="flex items-center gap-1 text-xs bg-transparent hover:bg-stone-200/40 text-stone-700 px-2.5 py-1.5 rounded-lg border border-stone-300/40 backdrop-blur transition-all cursor-pointer font-medium"
          >
            <Settings size={14} /> Settings
          </button>
        </div>

        {/* Paper Canvas Area */}
        <div className={`relative flex-1 w-full h-full pt-16 ${paperStyle === 'ruled' ? 'bg-[linear-gradient(to_bottom,#d1d5db_1px,transparent_1px)] bg-[size:100%_2.5rem]' : ''}`}>
          <canvas
            ref={canvasRef}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
            className="absolute inset-0 w-full h-full cursor-crosshair touch-none z-10"
          />
        </div>

        {/* Bottom Left Transparent Previous Page Button */}
        <button
          onClick={(e) => { e.stopPropagation(); goToPreviousPage(); }}
          title="Previous Page"
          className="absolute bottom-6 left-4 z-30 flex items-center justify-center w-10 h-10 rounded-full bg-transparent hover:bg-stone-300/30 active:bg-stone-400/40 text-stone-600 border border-stone-400/40 backdrop-blur-sm transition-all cursor-pointer"
        >
          <ChevronLeft size={20} />
        </button>

        {/* Bottom Floating Transparent Toolbar */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-stone-900/30 hover:bg-stone-900/70 backdrop-blur text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 border border-stone-700/30 transition-all">
          <button 
            onClick={(e) => { e.stopPropagation(); setToolMode('blue'); }}
            className={`text-xs px-3 py-1 rounded-full cursor-pointer transition-all flex items-center gap-1 ${toolMode === 'blue' ? 'bg-blue-600/90 text-white shadow' : 'text-stone-300 hover:bg-white/10'}`}
          >
            <PenTool size={12} /> Blue
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); setToolMode('black'); }}
            className={`text-xs px-3 py-1 rounded-full cursor-pointer transition-all flex items-center gap-1 ${toolMode === 'black' ? 'bg-zinc-800/90 text-white shadow' : 'text-stone-300 hover:bg-white/10'}`}
          >
            <PenTool size={12} /> Black
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); setToolMode('eraser'); }}
            className={`text-xs px-3 py-1 rounded-full cursor-pointer transition-all flex items-center gap-1 ${toolMode === 'eraser' ? 'bg-amber-600/90 text-white shadow' : 'text-stone-300 hover:bg-white/10'}`}
          >
            <Eraser size={12} /> Eraser
          </button>
        </div>

        {/* Bottom Right Transparent Next Page Button */}
        <button
          onClick={(e) => { e.stopPropagation(); goToNextPage(); }}
          title="Next Page"
          className="absolute bottom-6 right-4 z-30 flex items-center justify-center w-10 h-10 rounded-full bg-transparent hover:bg-stone-300/30 active:bg-stone-400/40 text-stone-600 border border-stone-400/40 backdrop-blur-sm transition-all cursor-pointer"
        >
          <ChevronRight size={20} />
        </button>

      </div>

      {/* --- SHOW BOOKMARKS MODAL (INDEX) --- */}
      {showIndexModal && (
        <div 
          onClick={(e) => e.stopPropagation()} 
          className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-6"
        >
          <div className="bg-stone-900/90 border border-stone-700/60 text-stone-100 max-w-xl w-full rounded-2xl shadow-2xl p-6 flex flex-col max-h-[80vh] backdrop-blur-xl">
            <div className="flex justify-between items-center mb-4 border-b border-stone-800 pb-3">
              <h2 className="text-lg font-serif text-amber-200">Journal Index & Bookmarks</h2>
              <button 
                onClick={() => setShowIndexModal(false)}
                className="text-xs bg-transparent hover:bg-stone-800 px-3 py-1.5 rounded-lg text-stone-300 border border-stone-700/50 cursor-pointer transition-all"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {pages.filter(p => p.isBookmarked).length === 0 ? (
                <p className="text-stone-400 text-sm text-center py-10">
                  No bookmarks yet! Click "Bookmark" on any page to add it to your index.
                </p>
              ) : (
                pages
                  .map((page, index) => ({ page, index }))
                  .filter(({ page }) => page.isBookmarked)
                  .map(({ page, index }) => (
                    <div 
                      key={page.id}
                      onClick={() => {
                        setCurrentPageIndex(index);
                        setShowIndexModal(false);
                      }}
                      className="bg-stone-950/80 border border-stone-800/80 hover:border-amber-600/50 p-4 rounded-xl flex justify-between items-center cursor-pointer transition-all"
                    >
                      <div>
                        <h3 className="font-serif text-amber-100 text-sm">{page.title}</h3>
                        <p className="text-xs text-stone-400 mt-0.5">Page {index + 1}</p>
                      </div>
                      <span className="text-xs bg-amber-950/60 text-amber-300 px-3 py-1 rounded-full border border-amber-900/40">
                        Jump to Page
                      </span>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- SETTINGS MODAL --- */}
      {showSettingsModal && (
        <div 
          onClick={(e) => e.stopPropagation()} 
          className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-6"
        >
          <div className="bg-stone-900/90 border border-stone-700/60 text-stone-100 max-w-md w-full rounded-2xl shadow-2xl p-6 flex flex-col backdrop-blur-xl">
            <div className="flex justify-between items-center mb-4 border-b border-stone-800 pb-3">
              <h2 className="text-lg font-serif text-amber-200">Journal Settings & Backup</h2>
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="text-xs bg-transparent hover:bg-stone-800 px-3 py-1.5 rounded-lg text-stone-300 border border-stone-700/50 cursor-pointer transition-all"
              >
                Close
              </button>
            </div>

            <div className="space-y-6 py-2">
              {/* Paper Style Selector */}
              <div>
                <label className="text-xs font-medium text-stone-400 uppercase tracking-wider block mb-2">Paper Style</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => handlePaperStyleChange('ruled')}
                    className={`py-2 px-4 rounded-xl text-xs font-medium border transition-all cursor-pointer ${paperStyle === 'ruled' ? 'bg-amber-600 text-white border-amber-500 shadow' : 'bg-stone-950/60 text-stone-300 border-stone-800 hover:border-stone-700'}`}
                  >
                    Ruled Lines
                  </button>
                  <button 
                    onClick={() => handlePaperStyleChange('unruled')}
                    className={`py-2 px-4 rounded-xl text-xs font-medium border transition-all cursor-pointer ${paperStyle === 'unruled' ? 'bg-amber-600 text-white border-amber-500 shadow' : 'bg-stone-950/60 text-stone-300 border-stone-800 hover:border-stone-700'}`}
                  >
                    Unruled (Blank)
                  </button>
                </div>
              </div>

              {/* Data Backup & Restore */}
              <div>
                <label className="text-xs font-medium text-stone-400 uppercase tracking-wider block mb-2">Backup & Recovery (JSON)</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={exportJSON}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-medium bg-stone-950/80 hover:bg-stone-800 text-stone-200 border border-stone-800 transition-all cursor-pointer shadow"
                  >
                    <Download size={14} /> Export JSON
                  </button>
                  <button 
                    onClick={() => importFileRef.current?.click()}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-medium bg-stone-950/80 hover:bg-stone-800 text-stone-200 border border-stone-800 transition-all cursor-pointer shadow"
                  >
                    <Upload size={14} /> Import JSON
                  </button>
                  <input 
                    type="file" 
                    ref={importFileRef} 
                    onChange={importJSON} 
                    accept=".json,.txt,application/json,text/plain" 
                    className="hidden" 
                  />
                </div>
              </div>

              {/* PDF Export */}
              <div>
                <label className="text-xs font-medium text-stone-400 uppercase tracking-wider block mb-2">Document Export</label>
                <button 
                  onClick={exportPDF}
                  disabled={isExportingPDF}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-medium bg-amber-600/90 hover:bg-amber-600 disabled:opacity-50 text-white border border-amber-500/60 transition-all cursor-pointer shadow"
                >
                  <FileText size={14} /> {isExportingPDF ? 'Generating PDF...' : 'Export Journal as PDF'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}