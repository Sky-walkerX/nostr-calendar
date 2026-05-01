/**
 * Form Responses Dialog
 *
 * Owner-only viewer for NIP-101 form responses (kind 1069). Mounted by
 * `CalendarEvent` for users whose pubkey matches the form's naddr-decoded
 * author pubkey.
 *
 * What we render:
 *   - For each respondent: their pubkey + per-field answers parsed from
 *     `["response", fieldId, value, ...]` tags.
 *   - Field labels come from the form template via the SDK so the table
 *     uses human-readable column names, not raw field ids.
 *
 * What we don't render (by design):
 *   - Encrypted forms (`settings.encryptForm`): we cannot decrypt the
 *     ciphertext payload in-app without SDK support for response keys,
 *     so we surface an "Open in Formstr" link instead. Showing partial
 *     or wrongly-decoded data here would be worse than punting.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { FormstrSDK } from "@formstr/sdk";
import dayjs from "dayjs";
import { useIntl } from "react-intl";
import type { Event as NostrEvent } from "nostr-tools";
import type { IFormAttachment } from "../utils/types";
import { fetchFormResponses } from "../common/nostr";
import {
  getFormCoordinate,
  getFormRelayHints,
  buildFormstrUrl,
} from "../utils/formLink";
import { Participant } from "./Participant";

type SdkField = {
  id: string;
  type: string;
  labelHtml: string;
  options?: { id: string; labelHtml: string }[];
};
type SdkForm = {
  id: string;
  name?: string;
  fields: Record<string, SdkField>;
  fieldOrder: string[];
  settings?: { encryptForm?: boolean; description?: string };
};

type Props = {
  open: boolean;
  attachment: IFormAttachment | null;
  candidatePubkeys?: string[];
  onClose: () => void;
};

/** Strip the SDK's HTML labels down to plain text for table headers. */
function plainText(html: string | undefined): string {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").trim();
}

/** Parse a single response event into { fieldId -> displayValue }. */
function parseResponse(
  event: NostrEvent,
  fields: Record<string, SdkField> | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const tag of event.tags) {
    if (tag[0] !== "response") continue;
    const fieldId = tag[1];
    const value = tag[2] ?? "";
    if (!fieldId) continue;
    const field = fields?.[fieldId];
    if (field?.type === "option" && field.options) {
      // Value may be option-id; map to label when possible.
      const opt = field.options.find((o) => o.id === value);
      result[fieldId] = opt ? plainText(opt.labelHtml) : value;
    } else {
      result[fieldId] = value;
    }
  }
  return result;
}

export function FormResponsesDialog({
  open,
  attachment,
  candidatePubkeys = [],
  onClose,
}: Props) {
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [form, setForm] = useState<SdkForm | null>(null);
  const [responses, setResponses] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!attachment) return;
    setLoading(true);
    setError(null);
    setForm(null);
    setResponses([]);
    try {
      const sdk = new FormstrSDK();
      // Use the encrypted-form fetch path when a responseKey is present;
      // passing the raw key to fetchForm causes a decrypt error.
      const fetchedForm = (await (attachment.responseKey
        ? sdk.fetchFormWithViewKey(attachment.naddr, attachment.responseKey)
        : sdk.fetchForm(attachment.naddr))) as SdkForm;
      setForm(fetchedForm);

      const coord = getFormCoordinate(attachment.naddr);
      if (!coord) throw new Error("Invalid form address");
      const events = await fetchFormResponses(
        coord,
        getFormRelayHints(attachment.naddr),
        candidatePubkeys,
      );
      setResponses(events);
    } catch (err) {
      console.error("[FormResponsesDialog] load failed", err);
      setError(
        err instanceof Error
          ? err.message
          : intl.formatMessage({ id: "formResponses.loadError" }),
      );
    } finally {
      setLoading(false);
    }
  }, [attachment, candidatePubkeys, intl]);

  useEffect(() => {
    if (open && attachment) load();
    if (!open) {
      setForm(null);
      setResponses([]);
      setError(null);
    }
  }, [open, attachment, load]);

  const isEncrypted = !!form?.settings?.encryptForm;

  const columns = useMemo(() => {
    if (!form) return [];
    return form.fieldOrder
      .map((id) => form.fields[id])
      .filter((f): f is SdkField => !!f && f.type !== "label");
  }, [form]);

  const rows = useMemo(
    () =>
      responses.map((event) => ({
        event,
        values: parseResponse(event, form?.fields),
      })),
    [responses, form],
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      fullWidth
      maxWidth="lg"
    >
      <DialogTitle sx={{ pr: 6 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6" component="span">
            {intl.formatMessage({ id: "formResponses.title" })}
          </Typography>
          {form?.name && (
            <Typography variant="body2" color="text.secondary">
              · {form.name}
            </Typography>
          )}
        </Stack>
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {loading && (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        )}

        {error && !loading && (
          <Stack spacing={2} alignItems="flex-start">
            <Alert severity="error" sx={{ width: "100%" }}>
              {error}
            </Alert>
            <Button variant="outlined" onClick={load}>
              {intl.formatMessage({ id: "form.retry" })}
            </Button>
          </Stack>
        )}

        {!loading && !error && form && isEncrypted && (
          <Stack spacing={2} alignItems="flex-start">
            <Alert severity="info" sx={{ width: "100%" }}>
              {intl.formatMessage({ id: "formResponses.encryptedNotice" })}
            </Alert>
            {attachment && (
              <Button
                variant="contained"
                href={buildFormstrUrl(attachment)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {intl.formatMessage({ id: "form.openExternal" })}
              </Button>
            )}
          </Stack>
        )}

        {!loading && !error && form && !isEncrypted && rows.length === 0 && (
          <Box py={4} textAlign="center">
            <Typography variant="body1" color="text.secondary">
              {intl.formatMessage({ id: "formResponses.empty" })}
            </Typography>
          </Box>
        )}

        {!loading && !error && form && !isEncrypted && rows.length > 0 && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    {intl.formatMessage({ id: "formResponses.respondent" })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({ id: "formResponses.submittedAt" })}
                  </TableCell>
                  {columns.map((col) => (
                    <TableCell key={col.id}>
                      {plainText(col.labelHtml)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map(({ event, values }) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <Participant pubKey={event.pubkey} isAuthor={false} />
                    </TableCell>
                    <TableCell>
                      {dayjs(event.created_at * 1000).format(
                        "YYYY-MM-DD HH:mm",
                      )}
                    </TableCell>
                    {columns.map((col) => (
                      <TableCell key={col.id}>{values[col.id] ?? ""}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
    </Dialog>
  );
}
