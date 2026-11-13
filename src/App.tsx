import React, { useState, useRef, useEffect } from 'react';
import { Bookmark, BookmarkCheck, List, ArrowLeft, Eraser, PenTool } from 'lucide-react';
import { ScreenOrientation } from '@capacitor/screen-orientation';

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
  const [toolMode, setToolMode] = useState<'blue' | 'black' | 'eraser'>('blue');
  const [showIndexModal, setShowIndexModal] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  // Load drawing and setup high-DPI crisp canvas when page changes or book opens
  useEffect(() => {
    if (isOpen && canvasRef.current && !showIndexModal) {
      const canvas = canvasRef.current;
      const dpr = window.devicePixelRatio || 1;
      
      // Set high resolution backing store
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      
      // Match CSS display size
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
            ctx.drawImage(img, 0, 0, window.innerWidth, window.innerHeight); 
          };
        }
      }
    }
  }, [isOpen, currentPageIndex, showIndexModal]);

  const saveCurrentPage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const updated = [...pages];
    updated[currentPageIndex] = { ...updated[currentPageIndex], dataUrl };
    setPages(updated);
    localStorage.setItem('analog_diary_pages', JSON.stringify(updated));
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

  // --- EDGE TAP NAVIGATION (15% margins for turning pages) ---
  const handleEdgeTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (showIndexModal) return;
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }

    const screenWidth = window.innerWidth;
    const clickX = e.clientX;
    const margin = screenWidth * 0.15;

    if (!isOpen) {
      setIsOpen(true);
      return;
    }

    if (clickX < margin) {
      saveCurrentPage();
      if (currentPageIndex > 0) {
        setCurrentPageIndex(currentPageIndex - 1);
      } else {
        setIsOpen(false);
      }
    } else if (clickX > screenWidth - margin) {
      saveCurrentPage();
      if (currentPageIndex < pages.length - 1) {
        setCurrentPageIndex(currentPageIndex + 1);
      } else {
        const newPage: PageData = {
          id: Date.now().toString(),
          dataUrl: '',
          isBookmarked: false,
          title: `Page ${pages.length + 1}`
        };
        const updated = [...pages, newPage];
        setPages(updated);
        localStorage.setItem('analog_diary_pages', JSON.stringify(updated));
        setCurrentPageIndex(currentPageIndex + 1);
      }
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
      ctx.lineWidth = 24; // Smooth eraser width
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = toolMode === 'blue' ? '#1e3a8a' : '#09090b';
      ctx.lineWidth = 2.5;
    }

    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
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
    <div 
      onClick={handleEdgeTap}
      className="fixed inset-0 bg-stone-950 overflow-hidden select-none cursor-pointer"
    >
      
      {/* --- FULLSCREEN COVER SCREEN --- */}
      <div className={`absolute inset-0 w-full h-full flex items-center justify-center bg-stone-950 transition-opacity duration-500 ${isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
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

        {/* Ruled Paper Canvas Area */}
        <div className="relative flex-1 w-full h-full pt-16 bg-[linear-gradient(to_bottom,#d1d5db_1px,transparent_1px)] bg-[size:100%_2.5rem]">
          <canvas
            ref={canvasRef}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
            className="absolute inset-0 w-full h-full cursor-crosshair touch-none z-10"
          />
        </div>

        {/* Bottom Floating Transparent Toolbar */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-stone-900/30 hover:bg-stone-900/70 backdrop-blur text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 border border-stone-700/30 transition-all">
          <button 
            onClick={(e) => { e.stopPropagation(); setToolMode('blue'); }}
            className={`text-xs px-3 py-1 rounded-full cursor-pointer transition-all flex items-center gap-1 ${toolMode === 'blue' ? 'bg-blue-600/90 text-white shadow' : 'text-stone-300 hover:bg-white/10'}`}
          >
            <PenTool size={12} /> Blue Ink
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); setToolMode('black'); }}
            className={`text-xs px-3 py-1 rounded-full cursor-pointer transition-all flex items-center gap-1 ${toolMode === 'black' ? 'bg-zinc-800/90 text-white shadow' : 'text-stone-300 hover:bg-white/10'}`}
          >
            <PenTool size={12} /> Black Ink
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); setToolMode('eraser'); }}
            className={`text-xs px-3 py-1 rounded-full cursor-pointer transition-all flex items-center gap-1 ${toolMode === 'eraser' ? 'bg-amber-600/90 text-white shadow' : 'text-stone-300 hover:bg-white/10'}`}
          >
            <Eraser size={12} /> Eraser
          </button>
        </div>

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

    </div>
  );
}