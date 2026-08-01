import React, { useMemo, useState } from 'react';
import {
  Box, Chip, IconButton, Stack, Tooltip, Typography
} from '@mui/material';
import {
  Check, ContentCopy, DataObject, DragIndicator, ExpandLess, ExpandMore
} from '@mui/icons-material';

const SENSITIVE_KEY = /(authorization|api[-_]?key|token|secret|password|credential|cookie|authvalue)/i;
const REDACTED = '[REDACTADO]';

const sanitizeUrl = (value) => {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return value;
  try {
    const parsed = new URL(value);
    for (const key of parsed.searchParams.keys()) {
      if (SENSITIVE_KEY.test(key)) parsed.searchParams.set(key, REDACTED);
    }
    return parsed.toString();
  } catch {
    return value;
  }
};

export const sanitizeTraceData = (value, parentKey = '', depth = 0) => {
  if (SENSITIVE_KEY.test(parentKey)) return REDACTED;
  if (depth > 12) return '[LIMITE DE PROFUNDIDAD]';
  if (Array.isArray(value)) return value.map((item) => sanitizeTraceData(item, parentKey, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : sanitizeTraceData(item, key, depth + 1),
    ]));
  }
  return sanitizeUrl(value);
};

export const workflowVariableToken = (path, mode = 'template') => (
  mode === 'code' ? `input${String(path).startsWith('[') ? '' : '.'}${path}` : `{{${path}}}`
);

const appendPath = (base, key, mode) => {
  if (mode !== 'code') return base ? `${base}.${key}` : String(key);
  if (/^\d+$/.test(String(key))) return `${base}[${key}]`;
  if (/^[A-Za-z_$][\w$]*$/.test(String(key))) return base ? `${base}.${key}` : String(key);
  return `${base}[${JSON.stringify(String(key))}]`;
};

const scalarLabel = (value) => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
};

const scalarColor = (value) => {
  if (value === null || value === undefined) return 'text.disabled';
  if (typeof value === 'string') return 'success.main';
  if (typeof value === 'number') return 'info.main';
  if (typeof value === 'boolean') return 'secondary.main';
  return 'text.secondary';
};

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const TreeRow = ({ name, value, path, mode, depth = 0, defaultOpen = true }) => {
  const isContainer = value && typeof value === 'object';
  const [open, setOpen] = useState(defaultOpen && depth < 2);
  const [copied, setCopied] = useState(false);
  const token = workflowVariableToken(path, mode);
  const children = isContainer ? Object.entries(value) : [];

  const copy = async (event) => {
    event.stopPropagation();
    if (!await copyText(token)) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const drag = (event) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-workflow-path', path);
    event.dataTransfer.setData('application/x-workflow-token', token);
    event.dataTransfer.setData('text/plain', token);
  };

  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.5}
        draggable
        onDragStart={drag}
        onClick={isContainer ? () => setOpen((current) => !current) : undefined}
        sx={{
          minHeight: 28,
          pl: `${Math.max(0, depth) * 14}px`,
          pr: 0.5,
          borderRadius: 1,
          cursor: 'grab',
          '&:hover': { bgcolor: 'action.hover' },
          '&:hover .json-actions': { opacity: 1 },
        }}
      >
        <DragIndicator sx={{ fontSize: 15, color: 'text.disabled' }} />
        {isContainer && (open ? <ExpandLess sx={{ fontSize: 16, color: 'text.secondary' }} /> : <ExpandMore sx={{ fontSize: 16, color: 'text.secondary' }} />)}
        <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: 11.5, color: 'text.primary', fontWeight: 700, flexShrink: 0 }}>
          {name}
        </Typography>
        {isContainer ? (
          <Chip size="small" label={Array.isArray(value) ? `${value.length} items` : `${children.length} campos`} sx={{ height: 18, fontSize: 9 }} />
        ) : (
          <Typography
            component="span"
            title={scalarLabel(value)}
            sx={{ fontFamily: 'monospace', fontSize: 11.5, color: scalarColor(value), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1 }}
          >
            {scalarLabel(value)}
          </Typography>
        )}
        <Tooltip title={copied ? 'Variable copiada' : `Copiar ${token}`}>
          <IconButton className="json-actions" size="small" onClick={copy} sx={{ ml: 'auto', opacity: isContainer ? 0.65 : 0, transition: 'opacity .15s' }}>
            {copied ? <Check color="success" sx={{ fontSize: 15 }} /> : <ContentCopy sx={{ fontSize: 14 }} />}
          </IconButton>
        </Tooltip>
      </Stack>
      {isContainer && open && children.map(([key, child]) => (
        <TreeRow
          key={`${path}.${key}`}
          name={Array.isArray(value) ? `[${key}]` : key}
          value={child}
          path={appendPath(path, key, mode)}
          mode={mode}
          depth={depth + 1}
          defaultOpen={defaultOpen}
        />
      ))}
    </Box>
  );
};

const JsonDataTree = ({ data, basePath = '', mode = 'template', emptyText = 'No hay datos disponibles.' }) => {
  const safeData = useMemo(() => sanitizeTraceData(data ?? {}), [data]);
  const entries = safeData && typeof safeData === 'object' ? Object.entries(safeData) : [['value', safeData]];

  if (!entries.length) {
    return (
      <Stack alignItems="center" spacing={1} sx={{ py: 4, color: 'text.secondary' }}>
        <DataObject color="disabled" />
        <Typography variant="caption" align="center">{emptyText}</Typography>
      </Stack>
    );
  }

  return (
    <Box sx={{ py: 0.5 }}>
      {entries.map(([key, value]) => (
        <TreeRow
          key={`${basePath}.${key}`}
          name={Array.isArray(safeData) ? `[${key}]` : key}
          value={value}
          path={appendPath(basePath, key, mode)}
          mode={mode}
        />
      ))}
    </Box>
  );
};

export default JsonDataTree;
