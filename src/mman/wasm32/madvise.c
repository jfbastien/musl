#include <sys/mman.h>
#include "libc.h"

int __madvise(void *addr, size_t len, int advice) { return 0; }

weak_alias(__madvise, madvise);
