import React from 'react';
import { Job } from '../../api/pipelineApi';

export const JobProgress: React.FC<{ job: Job }> = ({ job }) => {
    return (
        <div className="pipeline-progress-container bg-gray-900 border border-emerald-900 rounded-lg p-6 shadow-xl mb-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-amber-500">Pipeline Status</h3>
                <span className="px-3 py-1 rounded-full bg-emerald-900/50 text-emerald-400 border border-emerald-800 uppercase text-sm tracking-wider">
                    {job.status}
                </span>
            </div>
            
            <div className="w-full bg-gray-800 rounded-full h-4 mb-6 border border-gray-700">
                <div 
                    className="bg-gradient-to-r from-amber-600 to-emerald-500 h-4 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.max(0, job.progress * 100)}%` }}
                ></div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                    <div className="text-gray-400 text-sm">Frames Rendered</div>
                    <div className="text-2xl font-bold text-emerald-400">{job.frames_done} / {job.frames_total}</div>
                </div>
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                    <div className="text-gray-400 text-sm">Elapsed Time</div>
                    <div className="text-2xl font-bold text-amber-500">{job.elapsed_s}s</div>
                </div>
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 lg:col-span-1 col-span-2">
                    <div className="text-gray-400 text-sm">Current Process</div>
                    <div className="text-sm mt-1 font-mono text-emerald-300">{job.current_step || 'Initializing...'}</div>
                </div>
            </div>

            {job.pipeline_log && job.pipeline_log.segments && (
                <div className="mt-4">
                    <h4 className="text-gray-300 font-semibold mb-3 border-b border-gray-700 pb-2">Final Telemetry</h4>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-400">
                            <thead className="text-xs uppercase bg-gray-800 text-gray-300 border-b border-gray-700">
                                <tr>
                                    <th className="px-4 py-2">Frames</th>
                                    <th className="px-4 py-2 max-w-[150px]">Max Flow (px)</th>
                                    <th className="px-4 py-2 text-right">Bisected (Pass 2)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {job.pipeline_log.segments.map((seg: any, idx: number) => {
                                    const bisected = seg.safe_blend_mode; 
                                    return (
                                        <tr key={idx} className="bg-gray-900 border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                                            <td className="px-4 py-3 font-mono">{seg.segment}</td>
                                            <td className="px-4 py-3 text-amber-500 font-mono">{seg.flow_fwd_max_px}px</td>
                                            <td className={`px-4 py-3 text-right ${bisected ? 'bg-amber-500/10' : 'bg-emerald-600/10'}`}>
                                                {bisected ? (
                                                    <span className="text-amber-500 font-bold tracking-wider">YES</span>
                                                ) : (
                                                    <span className="text-emerald-600 font-bold tracking-wider">PASS</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
