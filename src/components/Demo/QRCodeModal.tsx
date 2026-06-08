import Modal from '@mui/material/Modal';
import Box from '@mui/material/Box';
import { QRCodeSVG } from 'qrcode.react';

const DEMO_URL = 'https://dark-trainers.vercel.app';
const VOLT = '#C8F000';

interface QRCodeModalProps {
  open: boolean;
  onClose: () => void;
}

export function QRCodeModal({ open, onClose }: QRCodeModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="qr-code-modal-title"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Box
        sx={{
          bgcolor: '#0a0a0a',
          border: '1px solid rgba(200, 240, 0, 0.3)',
          borderRadius: '12px',
          p: '40px',
          outline: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          maxWidth: 'calc(100vw - 2rem)',
        }}
      >
        <Box
          sx={{
            bgcolor: '#ffffff',
            p: 2,
            borderRadius: 1,
            display: 'inline-flex',
            mb: 2,
          }}
        >
          <QRCodeSVG value={DEMO_URL} size={200} />
        </Box>

        <Box
          component="p"
          id="qr-code-modal-title"
          sx={{
            m: 0,
            mb: 1,
            color: VOLT,
            fontSize: '0.95rem',
            fontWeight: 600,
            wordBreak: 'break-all',
          }}
        >
          {DEMO_URL}
        </Box>

        <Box component="p" sx={{ m: 0, mb: 2, color: '#d4d4d4', fontSize: '0.9rem' }}>
          Scan to open on your device
        </Box>

        <Box component="p" sx={{ m: 0, color: '#737373', fontSize: '0.75rem' }}>
          Press Esc to close
        </Box>
      </Box>
    </Modal>
  );
}
