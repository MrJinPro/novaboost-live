import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Header } from "@/components/Header";
import { HowItWorksLink } from "@/components/HowItWorksLink";
import { ProjectHelpPanel } from "@/components/ProjectHelpPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Lock, Trophy, Zap } from "lucide-react";
import { toast } from "sonner";
import { completeLiveTask, loadTasksData, type LiveTask } from "@/lib/tasks-data";

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
  const [tasks, setTasks] = useState<LiveTask[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [tasksLoading, setTasksLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const syncTasks = async () => {
      setTasksLoading(true);
      try {
        const data = await loadTasksData(user?.id);
        if (active) {
          setTasks(data.tasks);
          setCompleted(data.completedIds);
        }
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : "Не удалось загрузить задания");
        }
      } finally {
        if (active) {
          setTasksLoading(false);
        }
      }
    };

    void syncTasks();

    return () => {
      active = false;
    };
  }, [user?.id]);

  const completeTask = async (task: LiveTask, providedCode?: string) => {
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
    try {
      await completeLiveTask(user, task);
      setCompleted((prev) => new Set(prev).add(task.id));
      toast.success(`+${task.reward_points} очков за «${task.title}»`);
    } catch (error: any) {
      if (error?.code === "23505") {
        setCompleted((prev) => new Set(prev).add(task.id));
        toast.error("Уже выполнено");
        return;
      }
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить выполнение задания");
    }
  };

  const helpPanel = (
    <ProjectHelpPanel
      badge="Как работают задания"
      title="Что даёт этот раздел"
      description="Задания - это основной способ вовлекать зрителя и начислять ему viewer points внутри платформы."
      items={[
        {
          key: "tasks-points",
          title: "Зачем выполнять задания",
          body: "Через задания пользователь получает очки, повышает уровень и открывает возможность активнее участвовать в механиках NovaBoost Live, включая boost-поддержку стримеров.",
        },
        {
          key: "tasks-code",
          title: "Что такое кодовые слова",
          body: "Это задания, которые стример может активировать во время эфира. Они связывают live-активность и платформу NovaBoost Live, помогая переводить зрителя из эфира в продуктовую механику.",
        },
        {
          key: "tasks-internal",
          title: "Важно: очки - это внутренняя механика",
          body: "Points начисляются и тратятся только внутри NovaBoost Live. Они не являются деньгами и не обещают внешние бонусы вне логики платформы, если это прямо не объявлено отдельно.",
        },
      ]}
    />
  );

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="flex items-center gap-2">
          <Trophy className="h-7 w-7 text-amber" />
          <h1 className="font-display font-bold text-3xl md:text-4xl">Задания</h1>
        </div>
        <p className="mt-2 text-muted-foreground">Выполняй задания, вводи кодовые слова от стримеров, на которых подписан, и поднимай уровень по длинной шкале прогресса.</p>

        {tasksLoading && <div className="mt-6 text-sm text-muted-foreground">Загружаю задания…</div>}

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
                    {task.streamer_name && (
                      <div className="mt-1 text-xs text-cosmic">
                        Стример: {task.streamer_name}
                        {task.streamer_tiktok_username ? ` · @${task.streamer_tiktok_username}` : ""}
                      </div>
                    )}
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
                      <div className="mt-3 inline-flex items-center rounded-full border border-border/60 bg-background/50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Выполнение отслеживается автоматически
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {!tasksLoading && tasks.length === 0 && (
            <div className="rounded-3xl border border-border/50 bg-surface/60 p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cosmic/15 text-cosmic">
                  <Trophy className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-2xl font-bold">Сейчас активных заданий нет</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Экран пустой не потому, что что-то сломалось: сейчас задания появляются в основном, когда стример публикует кодовое слово во время эфира. Если ни один активный код не выпущен, список пока остаётся пустым.
                  </p>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-border/50 bg-background/30 p-4">
                      <div className="text-sm font-semibold">Что появится здесь</div>
                      <div className="mt-2 text-xs leading-5 text-muted-foreground">Кодовые слова, live-задания и будущие автоматические активности по стримерам, на которых ты подписан.</div>
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-background/30 p-4">
                      <div className="text-sm font-semibold">Как ускорить появление</div>
                      <div className="mt-2 text-xs leading-5 text-muted-foreground">Подписывайся на стримеров в каталоге и заходи на эфиры, где стример уже использует студию NovaBoost.</div>
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-background/30 p-4">
                      <div className="text-sm font-semibold">Почему это важно</div>
                      <div className="mt-2 text-xs leading-5 text-muted-foreground">Когда задания активны, они начисляют viewer points, двигают уровень и связывают live-активность с внутренней механикой платформы.</div>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link to="/streamers">
                      <Button className="bg-gradient-blast font-bold text-blast-foreground">Открыть каталог стримеров</Button>
                    </Link>
                    <Link to="/help">
                      <Button variant="outline">Как работают задания</Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-center">
          <HowItWorksLink />
        </div>

        <div className="mt-10">
          {helpPanel}
        </div>
      </div>
    </div>
  );
}
