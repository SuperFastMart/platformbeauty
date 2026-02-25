import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Alert } from '@mui/material';

/**
 * Reusable MUI confirmation dialog to replace window.confirm().
 *
 * Usage:
 *   const [confirm, setConfirm] = useState(null);
 *   <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />
 *   setConfirm({ title: '...', message: '...', confirmLabel: '...', onConfirm: () => { ... } });
 */
export default function ConfirmDialog({
  open = false,
  title = 'Are you sure?',
  message = '',
  warning = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmColor = 'primary',
  onConfirm,
  onClose,
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {warning && <Alert severity="warning" sx={{ mb: 2 }}>{warning}</Alert>}
        {typeof message === 'string' ? (
          <Typography>{message}</Typography>
        ) : message}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{cancelLabel}</Button>
        <Button variant="contained" color={confirmColor} onClick={() => { onConfirm?.(); onClose?.(); }}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
