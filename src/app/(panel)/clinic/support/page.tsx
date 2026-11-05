"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import type { TicketStatus } from "@/types";
import { RaiseTicketDialog } from "@/components/clinic/raise-ticket";
import { RequirePermission } from "@/components/shared/guards";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketList, TicketThread, useClinicTickets } from "@/components/support/tickets";

function Support() {
  const [status, setStatus] = useState<TicketStatus | "all">("all");
  const { list, all: tickets, isLoading, isError, refetch } = useClinicTickets(status);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openId = params.get("ticket");
  const open = openId ? tickets.find((t) => t.id === openId) : undefined;
  const setOpen = (id?: string) => router.replace(id ? `${pathname}?ticket=${id}` : pathname, { scroll: false });

  return (
    <>
      <PageHeader
        title="Support"
        description="Questions or problems? Raise a ticket and the Kivi team will reply here. Please don't include patient details."
        actions={
          <RaiseTicketDialog
            trigger={
              <Button>
                <Plus /> Raise a Ticket
              </Button>
            }
          />
        }
      />
      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : openId ? (
        open ? (
          <TicketThread ticket={open} onBack={() => setOpen()} />
        ) : isLoading ? (
          <LoadingState label="Loading ticket…" />
        ) : (
          <EmptyState title="Ticket not found" description="It may belong to another clinic." action={<Button variant="outline" onClick={() => setOpen()}>Back to tickets</Button>} />
        )
      ) : (
        <div className="grid gap-4">
          <Tabs value={status} onValueChange={(v) => setStatus(v as TicketStatus | "all")}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="resolved">Resolved</TabsTrigger>
              <TabsTrigger value="closed">Closed</TabsTrigger>
            </TabsList>
          </Tabs>
          {isLoading ? <LoadingState label="Loading tickets…" /> : <TicketList tickets={list} onOpen={(id) => setOpen(id)} />}
        </div>
      )}
    </>
  );
}

export default function SupportPage() {
  return (
    <RequirePermission perm="support:raise">
      <Support />
    </RequirePermission>
  );
}
