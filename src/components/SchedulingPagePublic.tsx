import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "react-router";
import {
  Box,
  Typography,
  Button,
  Chip,
  Paper,
  CircularProgress,
  Alert,
  Avatar,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Toolbar,
  IconButton,
  useMediaQuery,
  useTheme,
  Snackbar,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import dayjs, { Dayjs } from "dayjs";
import { NAddr } from "nostr-tools/nip19";
import { fetchSchedulingPage, sendBookingRequest } from "../common/nostr";
import { nostrEventToSchedulingPage } from "../utils/parser";
import { getBookableSlots } from "../utils/availabilityHelper";
import { useGetParticipant } from "../stores/participants";
import { useUser } from "../stores/user";
import { Header } from "./Header";
import type { ISchedulingPage, ITimeSlot } from "../utils/types";

type FetchState = "loading" | "loaded" | "error";

export const SchedulingPagePublic = () => {
  const { naddr } = useParams<{ naddr: string }>();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { user, updateLoginModal } = useUser();

  const [page, setPage] = useState<ISchedulingPage | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>("loading");
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<ITimeSlot | null>(null);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [bookingNote, setBookingNote] = useState("");
  const [bookingTitle, setBookingTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  // Fetch scheduling page data
  useEffect(() => {
    if (!naddr) return;
    setFetchState("loading");
    fetchSchedulingPage(naddr as NAddr)
      .then((event) => {
        const parsed = nostrEventToSchedulingPage(event);
        setPage(parsed);
        // Default to first slot duration if fixed mode
        if (
          parsed.durationMode === "fixed" &&
          parsed.slotDurations.length > 0
        ) {
          setSelectedDuration(parsed.slotDurations[0]);
        }
        setFetchState("loaded");
      })
      .catch((e) => {
        console.error(e);
        setFetchState("error");
      });
  }, [naddr]);

  // Compute available slots for the displayed week
  const weekStart = useMemo(() => selectedDate.startOf("week"), [selectedDate]);
  const weekEnd = useMemo(() => weekStart.add(7, "day"), [weekStart]);

  const slots = useMemo(() => {
    if (!page) return [];
    const durationMin =
      page.durationMode === "fixed" ? (selectedDuration ?? 30) : 30;
    return getBookableSlots(
      page,
      weekStart.valueOf(),
      weekEnd.valueOf(),
      durationMin,
      Date.now(),
    );
  }, [page, weekStart, weekEnd, selectedDuration]);

  // Group slots by date
  const slotsByDate = useMemo(() => {
    const grouped: Record<string, ITimeSlot[]> = {};
    for (const slot of slots) {
      const dateKey = dayjs(slot.start).format("YYYY-MM-DD");
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(slot);
    }
    return grouped;
  }, [slots]);

  // Days to display (the 7 days of the selected week)
  const weekDays = useMemo(() => {
    const days: Dayjs[] = [];
    for (let i = 0; i < 7; i++) {
      days.push(weekStart.add(i, "day"));
    }
    return days;
  }, [weekStart]);

  const navigateWeek = useCallback((direction: -1 | 1) => {
    setSelectedDate((d) => d.add(direction * 7, "day"));
    setSelectedSlot(null);
  }, []);

  const handleSlotClick = (slot: ITimeSlot) => {
    if (!user) {
      updateLoginModal(true);
      return;
    }
    setSelectedSlot(slot);
    setBookingDialogOpen(true);
  };

  const handleBookingSubmit = async () => {
    if (!selectedSlot || !page || !naddr) return;

    setSubmitting(true);
    try {
      const schedulingPageRef = `${31927}:${page.user}:${page.id}`;
      await sendBookingRequest({
        schedulingPageRef,
        creatorPubkey: page.user,
        start: selectedSlot.start,
        end: selectedSlot.end,
        title: bookingTitle || `Meeting with ${page.title}`,
        note: bookingNote,
      });

      setBookingDialogOpen(false);
      setSelectedSlot(null);
      setBookingTitle("");
      setBookingNote("");
      setSnackbar({
        open: true,
        message: "Booking request sent! You'll be notified when it's approved.",
        severity: "success",
      });
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message:
          e instanceof Error ? e.message : "Failed to send booking request",
        severity: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (ms: number) => {
    if (!page) return "";
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: page.timezone,
    }).format(ms);
  };

  if (fetchState === "loading") {
    return (
      <>
        <Header />
        <Toolbar />
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "50vh",
          }}
        >
          <CircularProgress />
        </Box>
      </>
    );
  }

  if (fetchState === "error" || !page) {
    return (
      <>
        <Header />
        <Toolbar />
        <Box sx={{ p: 3, maxWidth: 800, mx: "auto" }}>
          <Alert severity="error">
            Could not load scheduling page. It may have been deleted or is
            temporarily unavailable.
          </Alert>
        </Box>
      </>
    );
  }

  return (
    <>
      <Header />
      <Toolbar />
      <Box sx={{ maxWidth: 900, mx: "auto", p: isMobile ? 2 : 3 }}>
        {/* Creator Profile & Page Info */}
        <CreatorInfo pubkey={page.user} />

        <Typography variant="h5" sx={{ mt: 2, mb: 1 }}>
          {page.title}
        </Typography>

        {page.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {page.description}
          </Typography>
        )}

        <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
          {page.location && (
            <Chip
              icon={<LocationOnIcon />}
              label={page.location}
              size="small"
              variant="outlined"
            />
          )}
          <Chip
            icon={<AccessTimeIcon />}
            label={page.timezone}
            size="small"
            variant="outlined"
          />
        </Box>

        {/* Duration selector (for fixed-duration mode) */}
        {page.durationMode === "fixed" && page.slotDurations.length > 1 && (
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Select duration
            </Typography>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {page.slotDurations.map((mins) => (
                <Chip
                  key={mins}
                  label={mins >= 60 ? `${mins / 60} hr` : `${mins} min`}
                  color={selectedDuration === mins ? "primary" : "default"}
                  variant={selectedDuration === mins ? "filled" : "outlined"}
                  onClick={() => {
                    setSelectedDuration(mins);
                    setSelectedSlot(null);
                  }}
                />
              ))}
            </Box>
          </Paper>
        )}

        {/* Week navigation */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <IconButton onClick={() => navigateWeek(-1)} size="small">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="subtitle1">
            {weekStart.format("MMM D")} –{" "}
            {weekEnd.subtract(1, "day").format("MMM D, YYYY")}
          </Typography>
          <IconButton onClick={() => navigateWeek(1)} size="small">
            <ArrowForwardIcon />
          </IconButton>
        </Box>

        {/* Slots grid */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(7, 1fr)",
            gap: 1.5,
          }}
        >
          {weekDays.map((day) => {
            const dateKey = day.format("YYYY-MM-DD");
            const daySlots = slotsByDate[dateKey] || [];
            const isToday = day.isSame(dayjs(), "day");
            const isPast = day.isBefore(dayjs(), "day");

            return (
              <Paper
                key={dateKey}
                variant="outlined"
                sx={{
                  p: 1.5,
                  minHeight: 120,
                  opacity: isPast ? 0.5 : 1,
                  backgroundColor: isToday
                    ? "action.hover"
                    : "background.paper",
                }}
              >
                <Typography
                  variant="caption"
                  fontWeight={isToday ? 700 : 400}
                  sx={{ display: "block", mb: 1, textAlign: "center" }}
                >
                  {day.format("ddd")}
                  <br />
                  {day.format("MMM D")}
                </Typography>
                {daySlots.length === 0 ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", textAlign: "center" }}
                  >
                    —
                  </Typography>
                ) : (
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 0.5,
                    }}
                  >
                    {daySlots.map((slot, i) => (
                      <Button
                        key={i}
                        size="small"
                        variant={
                          selectedSlot === slot ? "contained" : "outlined"
                        }
                        onClick={() => handleSlotClick(slot)}
                        sx={{
                          fontSize: "0.7rem",
                          py: 0.25,
                          px: 0.5,
                          minWidth: 0,
                          textTransform: "none",
                        }}
                      >
                        {formatTime(slot.start)}
                      </Button>
                    ))}
                  </Box>
                )}
              </Paper>
            );
          })}
        </Box>

        {slots.length === 0 && (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <Typography color="text.secondary">
              No available slots this week. Try navigating to a different week.
            </Typography>
          </Box>
        )}
      </Box>

      {/* Booking Confirmation Dialog */}
      <Dialog
        open={bookingDialogOpen}
        onClose={() => setBookingDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Confirm Booking</DialogTitle>
        <DialogContent>
          {selectedSlot && page && (
            <Box
              sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
            >
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Date & Time
                </Typography>
                <Typography variant="body1">
                  {dayjs(selectedSlot.start).format("dddd, MMMM D, YYYY")}
                </Typography>
                <Typography variant="body1">
                  {formatTime(selectedSlot.start)} –{" "}
                  {formatTime(selectedSlot.end)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Timezone: {page.timezone}
                </Typography>
              </Box>
              <TextField
                fullWidth
                label="Meeting title"
                placeholder={`Meeting with ${page.title}`}
                value={bookingTitle}
                onChange={(e) => setBookingTitle(e.target.value)}
                size="small"
              />
              <TextField
                fullWidth
                label="Note (optional)"
                placeholder="Any additional information..."
                value={bookingNote}
                onChange={(e) => setBookingNote(e.target.value)}
                multiline
                rows={2}
                size="small"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBookingDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleBookingSubmit}
            disabled={submitting}
          >
            {submitting ? "Sending..." : "Request Booking"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};

/** Sub-component that shows the scheduling page creator's profile */
function CreatorInfo({ pubkey }: { pubkey: string }) {
  const { participant, loading } = useGetParticipant({ pubKey: pubkey });

  if (loading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Skeleton variant="circular" width={44} height={44} />
        <Skeleton width={120} height={24} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
      <Avatar src={participant.picture} sx={{ width: 44, height: 44 }}>
        {participant.name?.charAt(0)?.toUpperCase() || "?"}
      </Avatar>
      <Typography variant="subtitle1">
        {participant.name || pubkey.slice(0, 12) + "..."}
      </Typography>
    </Box>
  );
}
