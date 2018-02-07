# We require 3.9 because of the use of $<TARGET_OBJECTS:crt1>
cmake_minimum_required(VERSION 3.9)
project(MUSL)
enable_language(C ASM)
include(CheckCCompilerFlag)

# TODO(sbc): Add more arch detection here
if(${CMAKE_SYSTEM_PROCESSOR} STREQUAL "wasm32")
  set(ARCH "wasm32")
  set(WASM 1)
elseif(${CMAKE_SYSTEM_PROCESSOR} STREQUAL "x86_64")
  set(ARCH "x86_64")
else()
  error("Could not detect ARCH")
endif()

set(EMPTY_LIB_NAMES m rt pthread crypt util xnet resolv dl)

include_directories(
  ${MUSL_SOURCE_DIR}/arch/${ARCH}
  ${MUSL_SOURCE_DIR}/arch/generic
  ${MUSL_BINARY_DIR}/src/internal
  ${MUSL_SOURCE_DIR}/src/internal
  ${MUSL_BINARY_DIR}/include
  ${MUSL_SOURCE_DIR}/include
)

add_definitions(
 -D_XOPEN_SOURCE=700
 -std=c99
 -ffreestanding
 -nostdinc
)

set(OPTIONAL_FLAGS
 -fomit-frame-pointer
 -fno-unwind-tables
 -fno-asynchronous-unwind-tables
 -ffunction-sections
 -fdata-sections
 -fexcess-precision=standard
 -frounding-math
 -Wa,--noexecstack
)

set(WARNING_FLAGS
 -Werror
 -Wno-empty-body
 -Wno-incompatible-library-redeclaration
 -Wno-shift-op-parentheses
 -Wno-tautological-unsigned-zero-compare
 -Wno-tautological-constant-out-of-range-compare
 -Wno-tautological-unsigned-enum-zero-compare
 -Wno-ignored-attributes
 -Wno-format
 -Wno-bitwise-op-parentheses
 -Wno-logical-op-paretheses
 -Wno-string-plus-int
 -Wno-pointer-sign
 -Wno-dangling-else
 -Wno-absolute-value
 -Wno-parentheses
 -Wno-unknown-pragmas
)

foreach(flag IN LISTS OPTIONAL_FLAGS WARNING_FLAGS)
  check_c_compiler_flag(${flag} FLAG_${flag})
  if(FLAG_${flag})
    add_definitions(${flag})
  endif(FLAG_${flag})
endforeach(flag)

set(CMAKE_SHARED_LINKER_FLAGS "-nostdlib -Wl,-e,_dlstart")

add_custom_command(
  OUTPUT ${MUSL_BINARY_DIR}/src/internal/version.h
  COMMAND
  echo '\#define VERSION \"1\"' > ${MUSL_BINARY_DIR}/src/internal/version.h
  DEPENDS
  ${MUSL_SOURCE_DIR}/VERSION
)

# TODO(sbc): Remove dependency on sed to increase portability
add_custom_command(
  OUTPUT ${MUSL_BINARY_DIR}/include/bits/syscall.h
  COMMAND
  cp ${MUSL_SOURCE_DIR}/arch/${ARCH}/bits/syscall.h.in ${MUSL_BINARY_DIR}/include/bits/syscall.h &&
  sed -n -e s/__NR_/SYS_/p < ${MUSL_SOURCE_DIR}/arch/${ARCH}/bits/syscall.h.in >> ${MUSL_BINARY_DIR}/include/bits/syscall.h
  DEPENDS ${MUSL_SOURCE_DIR}/arch/${ARCH}/bits/syscall.h.in
)

# TODO(sbc): Remove dependency on sed to increase portability
add_custom_command(
  OUTPUT ${MUSL_BINARY_DIR}/include/bits/alltypes.h
  COMMAND
  sed -f ${MUSL_SOURCE_DIR}/tools/mkalltypes.sed ${MUSL_SOURCE_DIR}/arch/${ARCH}/bits/alltypes.h.in ${MUSL_SOURCE_DIR}/include/alltypes.h.in >${MUSL_BINARY_DIR}/include/bits/alltypes.h
  DEPENDS
  ${MUSL_SOURCE_DIR}/tools/mkalltypes.sed
  ${MUSL_SOURCE_DIR}/arch/${ARCH}/bits/alltypes.h.in
  ${MUSL_SOURCE_DIR}/include/alltypes.h.in
)

file(GLOB SOURCES "src/*/*.c")
file(GLOB LDSO_SOURCES "ldso/*.c")
file(GLOB ASM_SOURCES "src/*/${ARCH}/*.s")

# Filter out (replace) any sources that are provided in asm form
foreach(src IN LISTS ASM_SOURCES)
  string(REPLACE "/${ARCH}/" "/" src ${src})
  string(REPLACE ".s" ".c" src ${src})
  list(REMOVE_ITEM SOURCES ${src})
endforeach(src)

set(ALL_SOURCES
  ${SOURCES}
  ${ASM_SOURCES}
  ${MUSL_BINARY_DIR}/src/internal/version.h
  ${MUSL_BINARY_DIR}/include/bits/alltypes.h
  ${MUSL_BINARY_DIR}/include/bits/syscall.h
)

foreach(lib IN LISTS EMPTY_LIB_NAMES)
  # Include a random header here to avoid CMake warning about creating
  # a library with no sources.
  add_library(${lib} STATIC ${MUSL_SOURCE_DIR}/include/stdio.h)
  # Also to avoid a cmake warning
  set_property(TARGET ${lib} PROPERTY LINKER_LANGUAGE C)
endforeach(lib)

add_library(c-static STATIC ${ALL_SOURCES})
set_target_properties(c-static PROPERTIES OUTPUT_NAME c CLEAN_DIRECT_OUTPUT 1)

add_library(crt1 OBJECT crt/crt1.c)
set_target_properties(crt1 PROPERTIES OUTPUT_NAME crt1 CLEAN_DIRECT_OUTPUT 1)

add_custom_target(
  crt1.o ALL
  COMMAND cp $<TARGET_OBJECTS:crt1> crt1.o
  DEPENDS crt1
)

if(!WASM)
  add_library(c SHARED ${ALL_SOURCES} ${LDSO_SOURCES})
  install(TARGETS c DESTINATION lib)
endif(!WASM)

install(TARGETS c-static ${EMPTY_LIB_NAMES} DESTINATION lib)
install(FILES ${MUSL_BINARY_DIR}/crt1.o DESTINATION lib)
install(DIRECTORY ${MUSL_SOURCE_DIR}/include DESTINATION . FILES_MATCHING PATTERN *.h)
install(DIRECTORY ${MUSL_SOURCE_DIR}/arch/generic/bits DESTINATION include FILES_MATCHING PATTERN *.h)
install(DIRECTORY ${MUSL_SOURCE_DIR}/arch/${ARCH}/bits DESTINATION include FILES_MATCHING PATTERN *.h)
install(DIRECTORY ${MUSL_BINARY_DIR}/include/bits DESTINATION include FILES_MATCHING PATTERN *.h)
