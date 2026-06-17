"use client";

import { useState, useTransition } from "react";
import { ChevronsUpDown, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { createTask, updateTask, setAssignees } from "../_task-actions";
import type { StaffOption, TaskView } from "@/lib/tasks/types";

export function TaskDialog({
  open,
  onOpenChange,
  staff,
  task,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  staff: StaffOption[];
  task?: TaskView;
  onSaved?: () => void;
}) {
  const editing = !!task;
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [due, setDue] = useState(task?.due_date ?? "");
  const [ids, setIds] = useState<number[]>(
    task ? task.assignees.map((a) => a.id) : [],
  );
  const [staffOpen, setStaffOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selected = staff.filter((u) => ids.includes(u.id));
  const toggle = (id: number) =>
    setIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = () => {
    setError(null);
    start(async () => {
      try {
        if (editing && task) {
          await updateTask(task.id, {
            title,
            notes,
            dueDate: due || null,
          });
          await setAssignees(task.id, ids);
        } else {
          await createTask({
            title,
            notes,
            dueDate: due || null,
            assigneeIds: ids,
          });
        }
        onOpenChange(false);
        onSaved?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "할 일 수정" : "할 일 추가"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <Label htmlFor="task-title">제목</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="무엇을 해야 하나요?"
              autoFocus
            />
          </Field>
          <Field>
            <Label htmlFor="task-notes">메모</Label>
            <Textarea
              id="task-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </Field>
          <Field>
            <Label htmlFor="task-due">마감일</Label>
            <Input
              id="task-due"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </Field>
          <Field>
            <Label>담당자</Label>
            <Popover open={staffOpen} onOpenChange={setStaffOpen}>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-8 w-full justify-between px-2.5 font-normal"
                  />
                }
              >
                {selected.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {selected.map((u) => (
                      <Badge
                        key={u.id}
                        variant="outline"
                        className="gap-1 py-0.5 pr-1 pl-1"
                      >
                        <Avatar className="size-4">
                          {u.image && <AvatarImage src={u.image} alt="" />}
                          <AvatarFallback className="text-[8px]">
                            {u.name.slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        {u.name}
                        <button
                          type="button"
                          className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(u.id);
                          }}
                        >
                          <X className="size-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">담당자 선택</span>
                )}
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
              </PopoverTrigger>
              <PopoverContent className="w-[--anchor-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="이름 검색..." />
                  <CommandList>
                    <CommandEmpty>결과 없음</CommandEmpty>
                    <CommandGroup>
                      {staff.map((u) => (
                        <CommandItem
                          key={u.id}
                          value={`${u.name} ${u.id}`}
                          onSelect={() => toggle(u.id)}
                        >
                          <Check
                            className={cn(
                              "mr-1.5 size-3.5",
                              ids.includes(u.id) ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <Avatar className="mr-2 size-5">
                            {u.image && <AvatarImage src={u.image} alt="" />}
                            <AvatarFallback className="text-[9px]">
                              {u.name.slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          {u.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </Field>
          {error && <p className="text-[12px] text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            취소
          </Button>
          <Button onClick={submit} disabled={pending || !title.trim()}>
            {pending ? "저장 중…" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
