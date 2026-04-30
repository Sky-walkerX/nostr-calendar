/**
 * Form Filler Dialog
 *
 * Opens a Formstr-rendered form (NIP-101, kind 30168) for an attached
 * `IFormAttachment` from a private calendar event. The user fills the form
 * and the response (kind 1069) is signed via the active `signerManager`
 * signer and submitted by the SDK.
 *
 * Embedding model:
 * - We use `@formstr/sdk` (`FormstrSDK`) which renders the form as an HTML
 *   string and exposes a DOM-level submit listener. The HTML comes from a
 *   trusted Nostr form template — the same source the official Formstr web
 *   app trusts. No additional sanitization is applied.
 *
 * Failure model:
 * - On fetch failure: show a retry button. We do NOT silently proceed with
 *   the surrounding flow (e.g. invitation acceptance) so the caller can
 *   distinguish "user gave up" from "user actually submitted".
 * - On submit failure: surface the error and let the user retry.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { FormstrSDK } from "@formstr/sdk";
import type { Event as NostrEvent, EventTemplate } from "nostr-tools";
import { useIntl } from "react-intl";
import type { IFormAttachment } from "../utils/types";
import { signerManager } from "../common/signer";
import { useFormSubmissionStatus } from "../hooks/useFormSubmissionStatus";
import { useUser } from "../stores/user";

// SDK's NormalizedForm shape (subset we touch)
type SdkForm = {
  id: string;
  name?: string;
  html?: { form: string };
};

type Props = {
  open: boolean;
  attachment: IFormAttachment | null;
  /** 1-based position of this attachment in a list, for multi-form flows. */
  index?: number;
  /** Total number of attachments in the list, for multi-form flows. */
  total?: number;
  onClose: () => void;
  onSubmitted: (response: NostrEvent) => void;
};

export function FormFillerDialog({
  open,
  attachment,
  index,
  total,
  onClose,
  onSubmitted,
}: Props) {
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sdkRef = useRef<FormstrSDK | null>(null);
  const { user } = useUser();
  const { status, markSubmitted } = useFormSubmissionStatus(
    open ? attachment?.naddr : undefined,
    open ? user?.pubkey : undefined,
  );
  const alreadySubmitted = status.state === "submitted";
  const [resubmitting, setResubmitting] = useState(false);

  const [form, setForm] = useState<SdkForm | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchForm = useCallback(async () => {
    if (!attachment) return;
    setLoading(true);
    setFetchError(null);
    setSubmitError(null);
    setForm(null);
    try {
      if (!sdkRef.current) sdkRef.current = new FormstrSDK();
      const sdk = sdkRef.current;
      // Use the dedicated encrypted-form fetch path when a responseKey is
      // present — the SDK's fetchFormWithViewKey encodes it into the nkeys
      // payload that the decryption layer expects.  Passing the raw key to
      // fetchForm causes "Could not decrypt form with supplied keys: undefined".
      const fetched = (await (
        attachment.responseKey
          ? sdk.fetchFormWithViewKey(attachment.naddr, attachment.responseKey)
          : sdk.fetchForm(attachment.naddr)
      )) as SdkForm;
      sdk.renderHtml(fetched as never);
      setForm(fetched);
    } catch (err) {
      console.error("[FormFillerDialog] fetch failed", err);
      setFetchError(
        err instanceof Error
          ? err.message
          : intl.formatMessage({ id: "form.fetchError" }),
      );
    } finally {
      setLoading(false);
    }
  }, [attachment, intl]);

  // Fetch the form template only when we should render it: caller opened
  // the dialog AND the user has not already submitted (or has explicitly
  // chosen to resubmit).
  useEffect(() => {
    const shouldRender =
      open &&
      attachment &&
      (status.state === "not-submitted" ||
        status.state === "error" ||
        resubmitting);
    if (shouldRender) fetchForm();
    if (!open) {
      setForm(null);
      setFetchError(null);
      setSubmitError(null);
      setResubmitting(false);
    }
  }, [open, attachment, fetchForm, status.state, resubmitting]);

  // After form HTML is in the DOM, attach the SDK submit listener
  useEffect(() => {
    if (!form || !sdkRef.current || !containerRef.current) return;
    const sdk = sdkRef.current;

    const signer = async (event: EventTemplate): Promise<NostrEvent> => {
      const active = await signerManager.getSigner();
      return active.signEvent(event);
    };

    sdk.attachSubmitListener(form as never, signer, {
      onSuccess: ({ event }) => {
        setSubmitting(false);
        markSubmitted(event);
        onSubmitted(event);
      },
      onError: (err) => {
        console.error("[FormFillerDialog] submit failed", err);
        setSubmitting(false);
        setSubmitError(
          err instanceof Error
            ? err.message
            : intl.formatMessage({ id: "form.submitError" }),
        );
      },
    });

    // Mark "submitting" when the rendered <form> is submitted, so the user
    // gets feedback while the SDK signs + publishes.
    const root = containerRef.current;
    const formEl = root.querySelector("form");
    if (!formEl) return;
    const onSubmitDom = () => {
      setSubmitting(true);
      setSubmitError(null);
    };
    formEl.addEventListener("submit", onSubmitDom);
    return () => {
      formEl.removeEventListener("submit", onSubmitDom);
    };
  }, [form, intl, onSubmitted, markSubmitted]);

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullScreen={isMobile}
      fullWidth
      maxWidth="md"
    >
      <DialogTitle sx={{ pr: 6 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6" component="span">
            {form?.name || intl.formatMessage({ id: "form.fillTitle" })}
          </Typography>
          {total && total > 1 && index ? (
            <Typography variant="body2" color="text.secondary">
              ({index} / {total})
            </Typography>
          ) : null}
        </Stack>
        <IconButton
          aria-label="close"
          onClick={onClose}
          disabled={submitting}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {(status.state === "loading" || loading) && (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        )}

        {alreadySubmitted && !resubmitting && !loading && (
          <Stack spacing={2} alignItems="flex-start">
            <Alert
              icon={<CheckCircleIcon fontSize="inherit" />}
              severity="success"
              sx={{ width: "100%" }}
            >
              {intl.formatMessage({ id: "form.alreadySubmitted" })}
            </Alert>
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                onClick={() => {
                  if (status.state === "submitted" && status.event) {
                    onSubmitted(status.event);
                  } else {
                    onClose();
                  }
                }}
              >
                {intl.formatMessage({ id: "form.continue" })}
              </Button>
              <Button variant="outlined" onClick={() => setResubmitting(true)}>
                {intl.formatMessage({ id: "form.submitAgain" })}
              </Button>
            </Stack>
          </Stack>
        )}

        {fetchError && !loading && (
          <Stack spacing={2} alignItems="flex-start">
            <Alert severity="error" sx={{ width: "100%" }}>
              {fetchError}
            </Alert>
            <Button variant="outlined" onClick={fetchForm}>
              {intl.formatMessage({ id: "form.retry" })}
            </Button>
            {attachment && (
              <Button
                variant="text"
                href={`https://formstr.app/f/${encodeURIComponent(
                  attachment.naddr,
                )}${
                  attachment.responseKey
                    ? `?responseKey=${encodeURIComponent(attachment.responseKey)}`
                    : ""
                }`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {intl.formatMessage({ id: "form.openExternal" })}
              </Button>
            )}
          </Stack>
        )}

        {!loading &&
          !fetchError &&
          form &&
          !(alreadySubmitted && !resubmitting) && (
            <>
              {submitError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {submitError}
                </Alert>
              )}
              {/* SDK-generated HTML. Source is a trusted Nostr form template. */}
              <div
                ref={containerRef}
                dangerouslySetInnerHTML={{ __html: form.html?.form ?? "" }}
              />
            </>
          )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={submitting} color="inherit">
          {intl.formatMessage({ id: "form.cancel" })}
        </Button>
        {submitting && (
          <Box display="flex" alignItems="center" gap={1} px={1}>
            <CircularProgress size={16} />
            <Typography variant="body2" color="text.secondary">
              {intl.formatMessage({ id: "form.submitting" })}
            </Typography>
          </Box>
        )}
      </DialogActions>
    </Dialog>
  );
}
