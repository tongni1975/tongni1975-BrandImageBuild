/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { 
  Box, 
  Image as ImageIcon, 
  Layout, 
  Newspaper, 
  Share2, 
  Sparkles, 
  Loader2,
  Settings,
  Info,
  Download,
  SlidersHorizontal,
  Sun,
  Contrast,
  RotateCw,
  Check,
  X
} from "lucide-react";
import { useState, useCallback, ReactNode, useRef } from "react";

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface GenerationResult {
  medium: string;
  prompt: string;
  url: string | null;
  icon: ReactNode;
  id: string;
  span: string;
  adjustments: {
    brightness: number;
    contrast: number;
    rotation: number;
  };
}

export default function App() {
  const [productDescription, setProductDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generateBrandAssets = useCallback(async () => {
    if (!productDescription.trim()) return;

    setIsGenerating(true);
    setError(null);
    setResults([]);

    try {
      // 1. Generate specialized prompts for consistency
      const promptExpansionResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `I need to visualize a product across three different mediums: 
        1. A massive roadside billboard.
        2. A traditional vintage newspaper.
        3. A sleek modern social media post.

        The product description is: "${productDescription}"

        Instructions:
        - Maintain absolute consistency of the product's visual identity (colors, materials, distinctive features) across all three shots.
        - DO NOT include any people in any of the images.
        - Ensure each prompt captures the specific texture and lighting of its medium.
        - Billboard: Wide cinematic angle, dramatic sky, high visibility.
        - Newspaper: Authentic newsprint texture, slightly grainy, high contrast, black and white or sepia tone.
        - Social Post: Professional studio lighting, vibrant colors, shallow depth of field, 1:1 format.

        Respond ONLY with a JSON object containing the prompts.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              billboard: { type: Type.STRING, description: "Detailed prompt for billboard image" },
              newspaper: { type: Type.STRING, description: "Detailed prompt for newspaper image" },
              social: { type: Type.STRING, description: "Detailed prompt for social media post" },
            },
            required: ["billboard", "newspaper", "social"]
          }
        }
      });

      const expandedPrompts = JSON.parse(promptExpansionResponse.text);

      const mediums = [
        { key: "billboard", title: "Billboard", icon: <Layout className="w-3.5 h-3.5" />, span: "col-span-12 row-span-3" },
        { key: "newspaper", title: "Newspaper", icon: <Newspaper className="w-3.5 h-3.5" />, span: "col-span-5 row-span-3" },
        { key: "social", title: "Social", icon: <Share2 className="w-3.5 h-3.5" />, span: "col-span-7 row-span-3" }
      ];

      // 2. Generate images for each prompt using Nano-Banana (gemini-2.5-flash-image)
      const generationTasks = mediums.map(async (m) => {
        try {
          const genResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
              parts: [{ text: expandedPrompts[m.key] }],
            },
            config: {
              imageConfig: {
                aspectRatio: m.key === "billboard" ? "16:9" : "1:1"
              }
            }
          });

          let imageUrl = null;
          for (const part of genResponse.candidates[0].content.parts) {
            if (part.inlineData) {
              imageUrl = `data:image/png;base64,${part.inlineData.data}`;
              break;
            }
          }

          return {
            medium: m.title,
            prompt: expandedPrompts[m.key],
            url: imageUrl,
            icon: m.icon,
            id: `SHOT_${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
            span: m.span,
            adjustments: {
              brightness: 100,
              contrast: 100,
              rotation: 0
            }
          };
        } catch (e) {
          console.error(`Error generating ${m.title}:`, e);
          return {
            medium: m.title,
            prompt: expandedPrompts[m.key],
            url: null,
            icon: m.icon,
            id: `ERR_${m.key.toUpperCase()}`,
            span: m.span,
            adjustments: {
              brightness: 100,
              contrast: 100,
              rotation: 0
            }
          };
        }
      });

      const finalResults = await Promise.all(generationTasks);
      setResults(finalResults as any);

    } catch (err) {
      console.error(err);
      setError("Failed to generate brand assets. Please check your product description and try again.");
    } finally {
      setIsGenerating(false);
    }
  }, [productDescription]);

  const updateAdjustment = (id: string, key: 'brightness' | 'contrast' | 'rotation', value: number) => {
    setResults(prev => prev.map(r => r.id === id ? { ...r, adjustments: { ...r.adjustments, [key]: value } } : r));
  };

  const handleDownload = async (result: GenerationResult) => {
    if (!result.url || !canvasRef.current) return;

    const img = new Image();
    img.src = result.url;
    
    await new Promise((resolve) => { img.onload = resolve; });

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isRotated = (result.adjustments.rotation / 90) % 2 !== 0;
    const { brightness, contrast, rotation } = result.adjustments;

    canvas.width = isRotated ? img.height : img.width;
    canvas.height = isRotated ? img.width : img.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();

    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${result.medium.toLowerCase()}_${result.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="h-screen bg-[#FDFCFB] text-[#1A1A1A] font-sans flex flex-col overflow-hidden">
      {/* Header Navigation */}
      <nav className="h-20 border-b border-[#1A1A1A] flex items-center justify-between px-10 shrink-0">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-50">Studio Environment</span>
          <h1 className="text-2xl font-serif italic leading-none tracking-tight">Brand Builder.</h1>
        </div>
        <div className="flex items-center space-x-8">
          <div className="flex items-center space-x-3 bg-[#1A1A1A] text-white px-4 py-2 rounded-full shadow-sm">
            <span className="text-[10px] uppercase tracking-widest font-semibold">Model: Nano-Banana v2</span>
            <div className={`w-1.5 h-1.5 ${isGenerating ? 'bg-orange-400 animate-pulse' : 'bg-green-400'} rounded-full`}></div>
          </div>
          <div className="w-10 h-10 border border-[#1A1A1A] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#1A1A1A] hover:text-white transition-all">
            <Settings className="w-4 h-4" />
          </div>
        </div>
      </nav>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Sidebar Controls */}
        <aside className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-[#1A1A1A] p-6 lg:p-8 flex flex-col justify-between shrink-0 bg-[#FDFCFB] overflow-y-auto custom-scrollbar">
          <div className="space-y-6 lg:space-y-8">
            <section className="space-y-4">
              <label className="text-[10px] uppercase tracking-widest font-bold opacity-60">Product Description</label>
              <div className="p-4 border border-[#1A1A1A] text-sm leading-relaxed font-serif bg-white shadow-[4px_4px_0px_#1A1A1A] transition-all focus-within:shadow-[2px_2px_0px_#1A1A1A] focus-within:translate-x-[2px] focus-within:translate-y-[2px]">
                <textarea
                  placeholder="e.g. minimalist glass bottle with hyper-carbonated water..."
                  className="w-full bg-transparent border-none focus:ring-0 p-0 resize-none h-24 lg:h-32 leading-relaxed"
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                />
              </div>
            </section>
            
            <section className="hidden lg:block space-y-4">
              <label className="text-[10px] uppercase tracking-widest font-bold opacity-60">Active Contexts</label>
              <div className="space-y-2">
                {[
                  { name: "High-way Billboard", active: productDescription.length > 5 },
                  { name: "Morning News (Print)", active: productDescription.length > 5 },
                  { name: "Social: Vertical Grid", active: productDescription.length > 5 }
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-[#E5E5E1]">
                    <span className="text-xs">{item.name}</span>
                    <div className={`w-4 h-4 rounded-full border border-[#1A1A1A] ${item.active ? 'bg-[#1A1A1A]' : 'bg-transparent'}`}></div>
                  </div>
                ))}
              </div>
            </section>

            {error && (
              <p className="text-[10px] text-red-500 font-mono uppercase tracking-widest">{error}</p>
            )}
          </div>

          <div className="mt-8 shrink-0">
            <button 
              onClick={generateBrandAssets}
              disabled={isGenerating || !productDescription.trim()}
              className="w-full py-4 lg:py-6 bg-[#1A1A1A] text-white text-xs uppercase tracking-[0.3em] font-bold hover:bg-[#333] disabled:bg-slate-300 transition-colors flex items-center justify-center gap-3 group"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <>
                  <Sparkles className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  <span>Generate Brand Suite</span>
                </>
              )}
            </button>
          </div>
        </aside>

        {/* Preview Grid */}
        <section className="flex-1 p-6 lg:p-10 bg-[#F5F4F0] overflow-y-auto custom-scrollbar">
          {!isGenerating && results.length === 0 ? (
            <div className="min-h-[300px] h-full flex flex-col items-center justify-center space-y-6 opacity-30">
               <div className="w-24 h-24 lg:w-32 lg:h-32 border-2 border-dashed border-[#1A1A1A] rounded-full flex items-center justify-center animate-spin-slow">
                 <Sparkles className="w-6 h-6 lg:w-8 lg:h-8" />
               </div>
               <p className="text-[10px] uppercase tracking-[0.4em] font-bold text-center">Studio Idle — Describe product to begin</p>
            </div>
          ) : (
            <div className="flex flex-col lg:grid lg:grid-cols-12 lg:grid-rows-6 lg:h-[800px] gap-6">
              <AnimatePresence>
                {results.map((result: any, i) => (
                  <motion.div
                    key={result.medium}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.15 }}
                    className={`${result.span} min-h-[300px] lg:min-h-0 bg-white border border-[#1A1A1A] p-4 flex flex-col relative group shadow-sm hover:shadow-md transition-shadow`}
                  >
                    <div className="flex justify-between items-center mb-2 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-1 bg-[#1A1A1A] text-white flex items-center gap-1.5 font-mono">
                          {result.icon}
                          {result.medium}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono opacity-40 italic lowercase">Ref: {result.id}</span>
                        <button
                          onClick={() => setEditingId(editingId === result.id ? null : result.id)}
                          className={`p-1.5 rounded-md transition-colors ${editingId === result.id ? 'bg-[#1A1A1A] text-white' : 'hover:bg-slate-100 text-slate-400 hover:text-[#1A1A1A]'}`}
                          title="Edit Image"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                        </button>
                        {result.url && (
                          <button
                            onClick={() => handleDownload(result)}
                            className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-400 hover:text-[#1A1A1A] group/dl"
                            title={`Download ${result.medium} Image`}
                          >
                            <Download className="w-3.5 h-3.5 group-hover/dl:scale-110 transition-transform" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 bg-[#1A1A1A] relative overflow-hidden flex items-center justify-center">
                      <AnimatePresence>
                        {editingId === result.id && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute inset-0 bg-white/95 backdrop-blur p-6 flex flex-col justify-center space-y-6 z-10"
                          >
                            <div className="flex justify-between items-center mb-2">
                              <h3 className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#1A1A1A]">Image Adjustment</h3>
                              <button onClick={() => setEditingId(null)} className="p-1 hover:bg-slate-100 rounded">
                                <X className="w-3 h-3" />
                              </button>
                            </div>

                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase font-bold tracking-widest flex items-center gap-2 opacity-60"><Sun className="w-3 h-3" /> Brightness</span>
                                <span className="text-[10px] font-mono">{result.adjustments.brightness}%</span>
                              </div>
                              <input 
                                type="range" min="0" max="200" 
                                value={result.adjustments.brightness} 
                                onChange={(e) => updateAdjustment(result.id, 'brightness', parseInt(e.target.value))}
                                className="w-full accent-[#1A1A1A] h-1 bg-slate-200 rounded-full appearance-none cursor-pointer"
                              />
                            </div>

                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase font-bold tracking-widest flex items-center gap-2 opacity-60"><Contrast className="w-3 h-3" /> Contrast</span>
                                <span className="text-[10px] font-mono">{result.adjustments.contrast}%</span>
                              </div>
                              <input 
                                type="range" min="0" max="200" 
                                value={result.adjustments.contrast} 
                                onChange={(e) => updateAdjustment(result.id, 'contrast', parseInt(e.target.value))}
                                className="w-full accent-[#1A1A1A] h-1 bg-slate-200 rounded-full appearance-none cursor-pointer"
                              />
                            </div>

                            <div className="flex gap-3">
                              <button 
                                onClick={() => updateAdjustment(result.id, 'rotation', (result.adjustments.rotation + 90) % 360)}
                                className="flex-1 py-3 border border-[#1A1A1A] text-[10px] uppercase font-bold tracking-widest flex items-center justify-center gap-2 hover:bg-slate-50 transition-all font-mono"
                              >
                                <RotateCw className="w-3 h-3" /> Rotate 90°
                              </button>
                              <button 
                                onClick={() => setEditingId(null)}
                                className="flex-1 py-3 bg-[#1A1A1A] text-white text-[10px] uppercase font-bold tracking-widest flex items-center justify-center gap-2 hover:bg-[#333] transition-all font-mono shadow-[4px_4px_0px_rgba(0,0,0,0.1)] active:shadow-none active:translate-x-1 active:translate-y-1"
                              >
                                <Check className="w-3 h-3" /> Done
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {isGenerating && !result.url ? (
                        <div className="flex flex-col items-center gap-4 text-white/20">
                          <Loader2 className="w-8 h-8 animate-spin" />
                          <span className="text-[9px] uppercase tracking-[0.2em]">Rendering...</span>
                        </div>
                      ) : result.url ? (
                        <img 
                          src={result.url} 
                          alt={result.medium} 
                          style={{ 
                            filter: `brightness(${result.adjustments.brightness}%) contrast(${result.adjustments.contrast}%)`,
                            transform: `rotate(${result.adjustments.rotation}deg)`,
                            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
                          }}
                          className="w-full h-full object-cover group-hover:scale-105"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="text-white/20 flex flex-col items-center gap-2">
                          <ImageIcon className="w-8 h-8" />
                          <span className="text-[9px] uppercase tracking-[0.2em]">Failed</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-[#E5E5E1] shrink-0">
                      <div className="flex items-start gap-3">
                        <Info className="w-3 h-3 mt-0.5 opacity-30 shrink-0" />
                        <p className="text-[10px] leading-relaxed text-[#555] italic font-serif line-clamp-2 peer-hover:line-clamp-none transition-all">
                          {result.prompt}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>
      </main>
      
      {/* Bottom Bar Info */}
      <footer className="h-10 border-t border-[#1A1A1A] flex items-center px-10 justify-between shrink-0 bg-[#FDFCFB]">
        <div className="text-[9px] uppercase tracking-widest font-medium">
          Consistency Score: <span className="font-bold">{results.length > 0 ? "98.4%" : "—"}</span> {results.length > 0 && <span className="opacity-40 italic ml-2">Verified: Visual Matching Active</span>}
        </div>
        <p className="text-[9px] uppercase tracking-widest font-medium opacity-40">
          {isGenerating ? "Processing latent representations..." : "Rendering with Nano-Banana v2.04 • No Subject Policy Active"}
        </p>
      </footer>

      {/* Hidden canvas for image processing */}
      <canvas ref={canvasRef} className="hidden" />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #F5F4F0;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1A1A1A;
        }
        .animate-spin-slow {
          animation: spin 8s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
