import { X } from 'lucide-react';

const ModalLayout = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-xs animate-[fadeIn_0.2s]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="bg-surface w-full sm:max-w-md h-auto max-h-[90vh] sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-[slideUp_0.3s_ease-out]">
      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-surface sticky top-0 z-10"><h2 className="text-base font-bold text-gray-800">{title}</h2><button onClick={onClose} className="bg-gray-50 p-1.5 rounded-full text-gray-500 hover:bg-gray-100"><X size={18} /></button></div>
      <div className="flex-1 overflow-y-auto p-3 hide-scrollbar">{children}</div>
    </div>
  </div>
);

export default ModalLayout;
