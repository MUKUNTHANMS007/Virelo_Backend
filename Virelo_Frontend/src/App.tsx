import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PipelinePage } from './components/pipeline/PipelinePage';

/**
 * EXACT ROUTING CODE (React Router v6)
 * 
 * If your existing project uses react-router-dom v5, <Routes> will fail
 * and you must use <Switch> instead. Please ensure you have v6 installed:
 * npm install react-router-dom
 */

export const App: React.FC = () => {
    return (
        <BrowserRouter>
            <div className="app-container min-h-screen bg-black">
                {/* The new V3 Router Wrapper */}
                <Routes>
                    {/* Other existing routes can be placed here */}
                    
                    {/* Primary entry point to the Pipeline Engine */}
                    <Route path="/pipeline" element={<PipelinePage />} />
                    
                    {/* Fallback redirect for testing directly */}
                    <Route path="*" element={<Navigate to="/pipeline" replace />} />
                </Routes>
            </div>
        </BrowserRouter>
    );
};

export default App;
