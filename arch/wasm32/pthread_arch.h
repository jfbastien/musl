static inline struct pthread *__pthread_self(void) {
  return (struct pthread *)UINTPTR_MAX;
}

#define TP_ADJ(p) (p)

#define CANCEL_REG_IP 16

#define MC_PC gregs[REG_EIP]

#define __wait __wait
static inline void __wait(volatile int *addr, volatile int *waiters, int cnt, int priv) {}
static inline void __wake(volatile void *addr, int cnt, int priv) {}
static inline void __futexwait(volatile void *addr, int val, int priv) {}
