#ifndef __NR_restart_syscall
#include <bits/syscall.h>
#endif

#define a_barrier() syscall(__NR_membarrier)

#define a_cas(p, t, s) (abort(), s)

#define a_crash() abort()
