"use client";

import { useTransition } from "react";
import { Check, X } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { approveUser, rejectUser } from "../_actions";

interface PendingUser {
  id: number;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  createdAt: Date;
}

export function PendingUsers({ users }: { users: PendingUser[] }) {
  const [pending, startTransition] = useTransition();

  function handleApprove(userId: string) {
    startTransition(() => approveUser(userId));
  }

  function handleReject(userId: string) {
    startTransition(() => rejectUser(userId));
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>이름</TableHead>
          <TableHead>이메일</TableHead>
          <TableHead>신청일</TableHead>
          <TableHead className="w-24 text-right">작업</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell className="font-medium">{user.name}</TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>
              {new Date(user.createdAt).toLocaleDateString("ko-KR")}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={pending}
                  onClick={() => handleApprove(String(user.id))}
                  aria-label="승인"
                >
                  <Check className="size-4 text-success" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={pending}
                  onClick={() => handleReject(String(user.id))}
                  aria-label="거절"
                >
                  <X className="size-4 text-danger" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
