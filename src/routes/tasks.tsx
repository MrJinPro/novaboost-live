import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Lock, Trophy, Zap } from "lucide-react";
import { toast } from "sonner";
import { mockTasks } from "@/lib/mock-platform";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Задания — NovaBoost Live" },
      { name: "description", content: "Выполняй задания, вводи кодовые слова, получай очки и поднимай уровень." },
    ],
  }),
  component: TasksPage,
});

function TasksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks] = useState(mockTasks);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [codes, setCodes] = useState<Record<string, string>>({});

  const completeTask = async (task: (typeof mockTasks)[number], providedCode?: string) => {
    if (!user) {
      toast.error("Войди, чтобы выполнять задания");
      navigate({ to: "/auth" });
      return;
    }
    if (task.type === "code") {
      if (!providedCode || providedCode.trim().toUpperCase() !== (task.code ?? "").toUpperCase()) {
        toast.error("Неверный код");
        return;
      }
    }
    if (completed.has(task.id)) {
      toast.error("Уже выполнено");
      return;
    }
    setCompleted((prev) => new Set(prev).add(task.id));
    toast.success(`+${task.reward_points} очков за «${task.title}»`);
  };

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="flex items-center gap-2">
          <Trophy className="h-7 w-7 text-amber" />
          <h1 className="font-display font-bold text-3xl md:text-4xl">Задания</h1>
        </div>
        <p className="mt-2 text-muted-foreground">Выполняй задания и поднимай уровень. 100 очков = +1 уровень.</p>

        <div className="mt-6 space-y-3">
          {tasks.map((task) => {
            const done = completed.has(task.id);
            return (
              <div
                key={task.id}
                className={`rounded-2xl border bg-surface/60 p-5 transition-all ${
                  done ? "border-cosmic/40 bg-cosmic/5" : "border-border/50 hover:border-blast/40"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                    done ? "bg-cosmic/20 text-cosmic" : "bg-blast/15 text-blast"
                  }`}>
                    {done ? <CheckCircle2 className="h-6 w-6" /> : task.type === "code" ? <Lock className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display font-bold">{task.title}</h3>
                      <span className="rounded-full bg-blast/15 px-2 py-0.5 text-xs font-bold text-blast">
                        +{task.reward_points} очков
                      </span>
                    </div>
                    {task.description && <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>}

                    {!done && task.type === "code" && (
                      <div className="mt-3 flex gap-2">
                        <Input
                          placeholder="Введи код"
                          value={codes[task.id] ?? ""}
                          onChange={(e) => setCodes({ ...codes, [task.id]: e.target.value })}
                          className="bg-background border-border"
                        />
                        <Button onClick={() => completeTask(task, codes[task.id])} className="bg-gradient-blast text-blast-foreground font-bold">
                          Проверить
                        </Button>
                      </div>
                    )}
                    {!done && task.type !== "code" && (
                      <Button onClick={() => completeTask(task)} size="sm" className="mt-3 bg-gradient-blast text-blast-foreground font-bold">
                        Выполнить
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
