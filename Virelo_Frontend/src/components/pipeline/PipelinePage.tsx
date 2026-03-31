import React, { useRef, useState } from 'react';
import { usePipeline } from '../../hooks/usePipeline';
import { JobProgress } from './JobProgress';
import { VideoPlayer } from './VideoPlayer';

export const PipelinePage: React.FC = () => {
    const { job, jobId, error, uploadVideo, deleteJob } = usePipeline();
    const startFileRef = useRef<HTMLInputElement>(null);
    const endFileRef = useRef<HTMLInputElement>(null);
    const [startFile, setStartFile] = useState<File | null>(null);
    const [endFile, setEndFile] = useState<File | null>(null);

    const handleUpload = () => {
        if (startFile && endFile) {
            uploadVideo(startFile, endFile);
        }
    };

    return (
        <div className="min-h-screen bg-black text-gray-200 p-8 font-sans selection:bg-amber-500/30">
            <div className="max-w-6xl mx-auto">
                <header className="mb-12 text-center">
                    <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-emerald-400 animate-gradient-x">
                        Virelo V3 Pipeline
                    </h1>
                    <p className="text-emerald-500 mt-3 tracking-widest uppercase text-xs font-bold font-mono">
                        Dual-Seed Adaptive Generation Engine
                    </p>
                </header>

                {error && (
                    <div className="bg-red-950/50 border border-red-500/50 text-red-300 p-4 rounded-lg mb-8 text-center max-w-2xl mx-auto backdrop-blur-sm">
                        <span className="font-bold mr-2">Error:</span> {error}
                    </div>
                )}

                {!job && (
                    <div className="flex flex-col items-center justify-center py-16 bg-gray-900/40 border-2 border-gray-800 rounded-2xl border-dashed hover:border-emerald-700/50 transition-colors">
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-3xl mb-8 px-8">
                            {/* Start Frame */}
                            <div className="flex flex-col items-center p-6 bg-gray-900 rounded-xl border border-gray-700 shadow-lg">
                                <h4 className="text-amber-500 font-bold mb-4 tracking-wider text-sm">START FRAME</h4>
                                <input 
                                    type="file" 
                                    ref={startFileRef} 
                                    accept="image/*" 
                                    className="hidden" 
                                    id="start-upload"
                                    onChange={(e) => setStartFile(e.target.files?.[0] || null)}
                                />
                                <label 
                                    htmlFor="start-upload"
                                    className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-3 rounded-lg font-medium transition-all border border-gray-600 w-full text-center truncate"
                                >
                                    {startFile ? startFile.name : 'Select Image 1'}
                                </label>
                            </div>

                            {/* End Frame */}
                            <div className="flex flex-col items-center p-6 bg-gray-900 rounded-xl border border-gray-700 shadow-lg">
                                <h4 className="text-emerald-500 font-bold mb-4 tracking-wider text-sm">END FRAME</h4>
                                <input 
                                    type="file" 
                                    ref={endFileRef} 
                                    accept="image/*" 
                                    className="hidden" 
                                    id="end-upload"
                                    onChange={(e) => setEndFile(e.target.files?.[0] || null)}
                                />
                                <label 
                                    htmlFor="end-upload"
                                    className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-3 rounded-lg font-medium transition-all border border-gray-600 w-full text-center truncate"
                                >
                                    {endFile ? endFile.name : 'Select Image 2'}
                                </label>
                            </div>
                        </div>

                        <button 
                            onClick={handleUpload}
                            disabled={!startFile || !endFile}
                            className={`px-12 py-4 rounded-xl font-bold tracking-widest uppercase transition-all shadow-xl ${
                                startFile && endFile 
                                ? 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white cursor-pointer hover:shadow-emerald-900/50 border border-emerald-500/20' 
                                : 'bg-gray-800 text-gray-500 cursor-not-allowed border-gray-700'
                            }`}
                        >
                            Spin Up A100 Generation
                        </button>
                    </div>
                )}

                {job && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Column 1: Progress and Controls */}
                        <div className="flex flex-col space-y-6">
                            <JobProgress job={job} />
                            
                            <div className="bg-gray-900/80 border border-gray-800 p-6 rounded-xl text-center shadow-xl backdrop-blur-md">
                                <h4 className="text-gray-500 mb-4 font-bold uppercase tracking-widest text-xs">Pipeline Control</h4>
                                <button
                                    onClick={deleteJob}
                                    className="px-6 py-3 bg-red-950/40 text-red-500 hover:bg-red-900/60 hover:text-red-400 border border-red-900/50 rounded-lg transition-colors w-full font-semibold tracking-wide"
                                >
                                    Cancel & Delete Job
                                </button>
                            </div>
                        </div>

                        {/* Column 2: Player Output */}
                        <div className="h-full flex flex-col">
                            {job.status === 'complete' && jobId ? (
                                <VideoPlayer jobId={jobId} />
                            ) : (
                                <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-gray-900/30 border border-gray-800 border-dashed rounded-xl relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-emerald-500/5 animate-pulse"></div>
                                    <div className="w-16 h-16 border-4 border-amber-900/40 border-t-amber-500 rounded-full animate-spin mb-6 relative z-10"></div>
                                    <p className="text-amber-500/90 font-medium tracking-widest text-center px-8 relative z-10 uppercase text-sm">
                                        Pipeline Active<br/>
                                        <span className="text-xs font-mono text-emerald-600 mt-3 block normal-case">Streamed A100 Generation...</span>
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
