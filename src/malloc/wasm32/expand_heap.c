#include <limits.h>
#include <stdint.h>
#include <errno.h>
#include <sys/mman.h>
#include "libc.h"
#include "syscall.h"

#define WASM_PAGE_SIZE 65536

/* Expand the heap in-place use WebAssembly grow_memory operators.
 * The caller is responsible for locking to prevent concurrent calls. */

void *__expand_heap(size_t *pn)
{
	size_t n = *pn;
	n += -n & WASM_PAGE_SIZE-1;
	unsigned delta = n / WASM_PAGE_SIZE;

	unsigned res = __builtin_wasm_memory_grow(0, delta);
	if (res == (unsigned)-1) {
		errno = ENOMEM;
		return 0;
	}

	void *area = (void*)(WASM_PAGE_SIZE * res);
	*pn = n;
	return area;
}
