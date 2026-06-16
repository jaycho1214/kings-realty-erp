"use client";

import { useState, useTransition } from "react";
import {
  Shield,
  ShieldOff,
  Ban,
  ShieldCheck,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { setUserRole, banUser, unbanUser, deactivateUser } from "../_actions";

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  createdAt: Date;
}

interface UserListProps {
  users: UserRow[];
  currentUserId: string;
  isAdmin: boolean;
}

const CONFIRM_WORD = "비활성화";

const roleLabel: Record<string, string> = {
  admin: "관리자",
  staff: "직원",
  accounting: "회계",
  pending: "대기",
};

const assignableRoles: {
  value: "admin" | "staff" | "accounting";
  label: string;
}[] = [
  { value: "admin", label: "관리자로 변경" },
  { value: "accounting", label: "회계로 변경" },
  { value: "staff", label: "직원으로 변경" },
];

export function UserList({ users, currentUserId, isAdmin }: UserListProps) {
  const [pending, startTransition] = useTransition();
  const [deactivateTarget, setDeactivateTarget] = useState<UserRow | null>(
    null,
  );
  const [banTarget, setBanTarget] = useState<UserRow | null>(null);
  const [banReason, setBanReason] = useState("");
  const [deactivateReason, setDeactivateReason] = useState("");
  const [confirmText, setConfirmText] = useState("");

  function handleSetRole(
    userId: string,
    role: "admin" | "staff" | "accounting",
  ) {
    startTransition(() => setUserRole(userId, role));
  }

  function handleBan() {
    if (!banTarget) return;
    startTransition(async () => {
      await banUser(String(banTarget.id), banReason || undefined);
      setBanTarget(null);
      setBanReason("");
    });
  }

  function handleUnban(userId: string) {
    startTransition(() => unbanUser(userId));
  }

  function handleDeactivate() {
    if (!deactivateTarget) return;
    startTransition(async () => {
      await deactivateUser(
        String(deactivateTarget.id),
        deactivateReason || undefined,
      );
      setDeactivateTarget(null);
      setDeactivateReason("");
      setConfirmText("");
    });
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>이름</TableHead>
            <TableHead>이메일</TableHead>
            <TableHead>권한</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>가입일</TableHead>
            {isAdmin && <TableHead className="w-10">{""}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const isSelf = String(user.id) === currentUserId;
            const isBanned = !!user.banned;

            return (
              <TableRow key={user.id} className={isBanned ? "opacity-50" : ""}>
                <TableCell className="font-medium">
                  {user.name}
                  {isSelf && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      (나)
                    </span>
                  )}
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Badge
                    variant={user.role === "admin" ? "default" : "outline"}
                  >
                    {roleLabel[user.role ?? "staff"] ?? user.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  {isBanned ? (
                    <Badge variant="destructive">차단됨</Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-success border-success/30"
                    >
                      활성
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {new Date(user.createdAt).toLocaleDateString("ko-KR")}
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    {!isSelf && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={pending}
                            />
                          }
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {assignableRoles
                            .filter((r) => r.value !== user.role)
                            .map((r) => (
                              <DropdownMenuItem
                                key={r.value}
                                onClick={() =>
                                  handleSetRole(String(user.id), r.value)
                                }
                              >
                                {r.value === "admin" ? (
                                  <Shield className="size-4" />
                                ) : (
                                  <ShieldOff className="size-4" />
                                )}
                                {r.label}
                              </DropdownMenuItem>
                            ))}
                          {isBanned ? (
                            <DropdownMenuItem
                              onClick={() => handleUnban(String(user.id))}
                            >
                              <ShieldCheck className="size-4" />
                              차단 해제
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="text-danger"
                              onClick={() => setBanTarget(user)}
                            >
                              <Ban className="size-4" />
                              차단
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-danger"
                            onClick={() => setDeactivateTarget(user)}
                          >
                            <Trash2 className="size-4" />
                            계정 비활성화
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Ban Dialog */}
      <AlertDialog
        open={!!banTarget}
        onOpenChange={(next: boolean) => {
          if (!next) {
            setBanTarget(null);
            setBanReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {banTarget?.name}님을 차단하시겠습니까?
            </AlertDialogTitle>
            <AlertDialogDescription>
              차단된 사용자는 로그인할 수 없으며 기존 세션이 모두 만료됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">차단 사유 (선택)</label>
            <Input
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="차단 사유를 입력하세요..."
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={handleBan}
            >
              {pending ? "처리 중..." : "차단"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deactivate Dialog */}
      <AlertDialog
        open={!!deactivateTarget}
        onOpenChange={(next: boolean) => {
          if (!next) {
            setDeactivateTarget(null);
            setDeactivateReason("");
            setConfirmText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deactivateTarget?.name}님의 계정을 비활성화하시겠습니까?
            </AlertDialogTitle>
            <AlertDialogDescription>
              비활성화된 사용자는 로그인할 수 없으며 기존 세션이 모두
              만료됩니다. 관리자가 언제든지 다시 활성화할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">사유 (선택)</label>
              <Input
                value={deactivateReason}
                onChange={(e) => setDeactivateReason(e.target.value)}
                placeholder="퇴사, 부서 이동 등..."
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                비활성화를 확인하려면 아래에{" "}
                <span className="font-semibold text-foreground">
                  {CONFIRM_WORD}
                </span>
                를 입력하세요.
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_WORD}
                autoComplete="off"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={confirmText !== CONFIRM_WORD || pending}
              onClick={handleDeactivate}
            >
              {pending ? "처리 중..." : "비활성화"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
