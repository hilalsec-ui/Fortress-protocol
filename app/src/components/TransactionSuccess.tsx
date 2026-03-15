import React from 'react';
import { CheckCircle, ExternalLink, Ticket } from 'lucide-react';
import { FPT_TOKEN_ICON } from '../utils/constants';

interface TransactionSuccessProps {
  transactionSignature: string;
  tier: number;
  participantId: number;
  lotteryType: string;
  onClose: () => void;
}

const TransactionSuccess: React.FC<TransactionSuccessProps> = ({
  transactionSignature,
  tier,
  participantId,
  lotteryType,
  onClose,
}) => {
  // Shorten the transaction signature for display (handle undefined/null)
  const shortSignature = transactionSignature 
    ? `${transactionSignature.substring(0, 8)}...${transactionSignature.substring(transactionSignature.length - 8)}`
    : 'demo_tx_000000...00000000';

  // Generate Solana Explorer URL
  const explorerUrl = transactionSignature
    ? `https://explorer.solana.com/tx/${transactionSignature}`
    : '#';

  return (
    <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-xl p-6 w-full max-w-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white flex items-center space-x-2">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <span>Ticket Purchased Successfully!</span>
        </h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded-full transition-colors"
        >
          <span className="text-gray-400 text-sm">×</span>
        </button>
      </div>

      <div className="space-y-4">
        {/* Transaction Info */}
        <div className="bg-black/30 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Transaction</span>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
            >
              <span>View on Explorer</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="text-sm font-mono text-white break-all">{shortSignature}</div>
        </div>

        {/* Ticket Info */}
        <div className="bg-black/30 rounded-lg p-3">
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Ticket Details</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Lottery Type</span>
              <span className="text-sm font-medium text-white">{lotteryType}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Tier</span>
              <span className="text-sm font-medium text-green-400 flex items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={FPT_TOKEN_ICON} alt="FPT" className="w-4 h-4 rounded-full" />
                {tier} FPT
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Participant ID</span>
              <span className="text-sm font-medium text-white">#{participantId}</span>
            </div>
          </div>
        </div>

        {/* Success Message */}
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center space-x-2">
            <Ticket className="w-4 h-4 text-green-400" />
            <span className="text-sm text-green-300">
              Your ticket has been successfully purchased and recorded on the blockchain!
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransactionSuccess;